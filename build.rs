extern crate napi_build;
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
struct ProbeDefinition {
  name: String,
  arg_types: Vec<String>,
}

fn main() {
  println!("cargo:rerun-if-changed=oldtests/");
  println!("cargo:rerun-if-changed=tests/");

  // Discover all probes from test files and generate probes.d
  let probes = discover_probes_from_tests();
  if let Err(e) = generate_probes_d(&probes) {
    eprintln!("Warning: Failed to generate probes.d: {e}");
  } else {
    println!("Generated {} probe definitions", probes.len());
  }

  napi_build::setup();
  usdt::Builder::new("probes.d").build().unwrap();
}

fn discover_probes_from_tests() -> Vec<ProbeDefinition> {
  let mut probes = Vec::new();

  // Scan oldtests directory
  if let Ok(entries) = fs::read_dir("oldtests") {
    for entry in entries.flatten() {
      if entry.path().extension().and_then(|s| s.to_str()) == Some("js") {
        let file_probes = extract_probes_from_file(&entry.path());
        for probe in file_probes {
          probes.push(probe);
        }
      }
    }
  }

  // Scan tests directory
  if let Ok(entries) = fs::read_dir("tests") {
    for entry in entries.flatten() {
      if entry.path().extension().and_then(|s| s.to_str()) == Some("ts")
        || entry.path().extension().and_then(|s| s.to_str()) == Some("js")
      {
        let file_probes = extract_probes_from_file(&entry.path());
        for probe in file_probes {
          probes.push(probe);
        }
      }
    }
  }

  probes
}

fn extract_probes_from_file(path: &Path) -> Vec<ProbeDefinition> {
  let content = match fs::read_to_string(path) {
    Ok(content) => content,
    Err(_) => return Vec::new(),
  };

  extract_probes_from_content(&content)
}

fn extract_probes_from_content(content: &str) -> Vec<ProbeDefinition> {
  let mut probes = Vec::new();

  // More robust regex that handles proper JavaScript function calls
  let add_probe_regex = Regex::new(
    r#"\.addProbe\s*\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`](?:\s*,\s*['"`]([^'"`]+)['"`])*"#,
  )
  .unwrap();

  // Pre-compile the quoted args regex outside the loop
  let quoted_args_regex = Regex::new(r#"['"`]([^'"`]+)['"`]"#).unwrap();

  for line in content.lines() {
    let line = line.trim();

    // Skip comments and malformed lines
    if line.starts_with("//") || line.starts_with("/*") || line.contains("' + ") {
      continue;
    }

    if let Some(captures) = add_probe_regex.captures(line) {
      let name = captures.get(1).unwrap().as_str();

      // Double check the name is valid
      if !is_valid_probe_name(name) {
        continue;
      }

      // Extract all quoted arguments after the probe name
      let mut types = Vec::new();

      for (i, cap) in quoted_args_regex.find_iter(line).enumerate() {
        if i == 0 {
          continue; // Skip the probe name
        }
        let type_str = cap
          .as_str()
          .trim_matches(|c| c == '\'' || c == '"' || c == '`');

        // Only add valid type names
        if is_valid_type_name(type_str) {
          types.push(normalize_type(type_str));
        }
      }

      probes.push(ProbeDefinition {
        name: name.to_string(),
        arg_types: types,
      });
    }
  }

  probes
}

fn is_valid_probe_name(name: &str) -> bool {
  !name.is_empty()
        && !name.contains('+')
        && !name.contains(' ')
        && !name.contains('(')
        && !name.contains(')')
        && !name.contains('-')  // DTrace doesn't support hyphens
        && !name.contains("'")  // No quotes
        && !name.contains("\"") // No quotes
        && name.chars().all(|c| c.is_alphanumeric() || c == '_')
        && name.chars().next().is_some_and(|c| c.is_alphabetic() || c == '_') // Must start with letter or underscore
}

fn is_valid_type_name(type_name: &str) -> bool {
  matches!(type_name, "int" | "char *" | "char*" | "string" | "json")
}

fn normalize_type(type_str: &str) -> String {
  match type_str.trim() {
    "int" => "int".to_string(),
    "char *" | "char*" | "string" => "string".to_string(),
    "json" => "json".to_string(),
    _ => "string".to_string(), // Default to string for unknown types
  }
}

fn generate_signature_suffix(signature: &[String]) -> String {
  if signature.is_empty() {
    return String::new();
  }

  signature
    .iter()
    .map(|t| match t.as_str() {
      "int" => "int",
      "string" => "str",
      "json" => "json",
      _ => "unk",
    })
    .collect::<Vec<_>>()
    .join("_")
}

fn generate_probes_d(probes: &[ProbeDefinition]) -> std::io::Result<()> {
  let mut content = String::new();
  content.push_str("provider nodeapp {\n");

  // Create unique probe names for each distinct signature
  let mut unique_probes = HashMap::new();
  let mut probe_variants = HashMap::<String, Vec<Vec<String>>>::new();

  // Group all signatures by probe name
  for probe in probes {
    probe_variants
      .entry(probe.name.clone())
      .or_default()
      .push(probe.arg_types.clone());
  }

  // Remove duplicates and create unique probe names with descriptive suffixes
  for (base_name, signatures) in probe_variants {
    let mut unique_signatures = Vec::new();
    for sig in signatures {
      if !unique_signatures.contains(&sig) {
        unique_signatures.push(sig);
      }
    }

    // Generate descriptive names for ALL signatures (no "original" names)
    for signature in unique_signatures.iter() {
      let suffix = generate_signature_suffix(signature);
      let variant_name = if suffix.is_empty() {
        // Only no-argument probes keep the base name
        base_name.clone()
      } else {
        // All other probes get descriptive suffixes
        format!("{base_name}_{suffix}")
      };
      unique_probes.insert(variant_name, signature.clone());
    }
  }

  // Generate probe definitions with unique names
  for (name, signature) in &unique_probes {
    if signature.is_empty() {
      content.push_str(&format!("    probe {name}();\n"));
    } else {
      // Generate DTrace types
      let dtrace_types = signature
        .iter()
        .map(|t| match t.as_str() {
          "int" => "uint64_t",
          "json" | "string" => "char*",
          _ => "char*",
        })
        .collect::<Vec<_>>()
        .join(", ");

      content.push_str(&format!("    probe {name}({dtrace_types});\n"));
    }
  }

  // Add standard probes
  content.push_str("    probe probe_enable();\n");
  content.push_str("    probe probe_disable();\n");
  content.push_str("    probe provider_enabled(char*);\n");
  content.push_str("    probe provider_disabled(char*);\n");
  content.push_str("};\n");

  fs::write("probes.d", content)?;

  // Generate the dynamic firing code with unique probe names
  let mut firing_code = String::from("// Auto-generated probe firing code\n");
  firing_code
    .push_str("fn fire_probe_by_types(probe_name: &str, _types: &[String], args: &[String]) {\n");
  firing_code
    .push_str("    // Map probe name + arg types to unique probe name based on type inference\n");
  firing_code.push_str("    let inferred_types: Vec<String> = args.iter().map(|arg| {\n");
  firing_code.push_str("        if arg.parse::<u64>().is_ok() { \"int\".to_string() }\n");
  firing_code.push_str("        else { \"string\".to_string() }\n");
  firing_code.push_str("    }).collect();\n\n");

  firing_code.push_str("    let signature_key = inferred_types.join(\",\");\n\n");

  // Generate mappings based on signatures
  let mut base_name_to_variants = HashMap::<String, Vec<(Vec<String>, String)>>::new();
  for (unique_name, signature) in &unique_probes {
    let base_name = if unique_name.contains('_') {
      unique_name.split('_').next().unwrap_or(unique_name)
    } else {
      unique_name
    };

    base_name_to_variants
      .entry(base_name.to_string())
      .or_default()
      .push((signature.clone(), unique_name.clone()));
  }

  firing_code.push_str("    let unique_probe_name = match probe_name {\n");

  for (base_name, variants) in &base_name_to_variants {
    firing_code.push_str(&format!("        \"{base_name}\" => {{\n"));
    firing_code.push_str("            match signature_key.as_str() {\n");

    for (signature, unique_name) in variants {
      let signature_str = signature.join(",");
      firing_code.push_str(&format!(
        "                \"{signature_str}\" => \"{unique_name}\",\n"
      ));
    }

    firing_code.push_str(&format!(
      "                _ => \"{base_name}\", // fallback to first variant\n"
    ));
    firing_code.push_str("            }\n");
    firing_code.push_str("        },\n");
  }

  firing_code.push_str("        _ => probe_name, // fallback to original name\n");
  firing_code.push_str("    };\n\n");
  firing_code.push_str("    match unique_probe_name {\n");

  for (name, signature) in &unique_probes {
    firing_code.push_str(&format!("        \"{name}\" => {{\n"));

    if signature.is_empty() {
      firing_code.push_str(&format!("            nodeapp::{name}!(|| ());\n"));
    } else {
      // Generate argument conversion based on signature
      let mut arg_conversions = Vec::new();
      for (i, arg_type) in signature.iter().enumerate() {
        let access_method = if i == 0 {
          "args.first()"
        } else {
          &format!("args.get({i})")
        };
        match arg_type.as_str() {
          "int" => {
            arg_conversions.push(format!(
              "{access_method}.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)"
            ));
          }
          "json" | "string" => {
            arg_conversions.push(format!(
              "{access_method}.map(|s| s.as_str()).unwrap_or(\"\")"
            ));
          }
          _ => {
            arg_conversions.push(format!(
              "{access_method}.map(|s| s.as_str()).unwrap_or(\"\")"
            ));
          }
        }
      }

      if arg_conversions.len() == 1 {
        let arg0_conv = &arg_conversions[0];
        firing_code.push_str(&format!("            let arg0 = {arg0_conv};\n"));
        firing_code.push_str(&format!("            nodeapp::{name}!(|| (arg0));\n"));
      } else if arg_conversions.len() == 2 {
        let arg0_conv = &arg_conversions[0];
        let arg1_conv = &arg_conversions[1];
        firing_code.push_str(&format!("            let arg0 = {arg0_conv};\n"));
        firing_code.push_str(&format!("            let arg1 = {arg1_conv};\n"));
        firing_code.push_str(&format!("            nodeapp::{name}!(|| (arg0, arg1));\n"));
      } else if arg_conversions.len() == 3 {
        let arg0_conv = &arg_conversions[0];
        let arg1_conv = &arg_conversions[1];
        let arg2_conv = &arg_conversions[2];
        firing_code.push_str(&format!("            let arg0 = {arg0_conv};\n"));
        firing_code.push_str(&format!("            let arg1 = {arg1_conv};\n"));
        firing_code.push_str(&format!("            let arg2 = {arg2_conv};\n"));
        firing_code.push_str(&format!(
          "            nodeapp::{name}!(|| (arg0, arg1, arg2));\n"
        ));
      }
    }

    firing_code.push_str("        },\n");
  }

  // Add standard probes
  firing_code.push_str("        \"probe_enable\" => nodeapp::probe_enable!(|| ()),\n");
  firing_code.push_str("        \"probe_disable\" => nodeapp::probe_disable!(|| ()),\n");
  firing_code.push_str("        \"provider_enabled\" => {\n");
  firing_code
    .push_str("            let arg0 = args.first().map(|s| s.as_str()).unwrap_or(\"\");\n");
  firing_code.push_str("            nodeapp::provider_enabled!(|| (arg0));\n");
  firing_code.push_str("        },\n");
  firing_code.push_str("        \"provider_disabled\" => {\n");
  firing_code
    .push_str("            let arg0 = args.first().map(|s| s.as_str()).unwrap_or(\"\");\n");
  firing_code.push_str("            nodeapp::provider_disabled!(|| (arg0));\n");
  firing_code.push_str("        },\n");
  firing_code.push_str("        _ => {}\n");
  firing_code.push_str("    }\n");
  firing_code.push_str("}\n");

  // Write the generated firing code to a file that lib.rs can include
  fs::write("src/generated_probes.rs", firing_code)?;

  Ok(())
}
