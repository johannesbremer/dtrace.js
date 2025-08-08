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

fn generate_probes_d(probes: &[ProbeDefinition]) -> std::io::Result<()> {
  let mut content = String::new();
  content.push_str("provider nodeapp {\n");

  // Group all signatures by probe name
  let mut probe_variants: HashMap<String, Vec<Vec<String>>> = HashMap::new();
  for probe in probes {
    probe_variants
      .entry(probe.name.clone())
      .or_default()
      .push(probe.arg_types.clone());
  }

  // Build merged base signatures: max arity; INT WINS over string/json per position
  let mut base_probes: HashMap<String, Vec<String>> = HashMap::new();
  for (base_name, signatures) in probe_variants {
    let mut unique_signatures: Vec<Vec<String>> = Vec::new();
    for sig in signatures {
      if !unique_signatures.contains(&sig) {
        unique_signatures.push(sig);
      }
    }

    let max_arity = unique_signatures.iter().map(|s| s.len()).max().unwrap_or(0);
    let mut merged: Vec<String> = vec!["string".to_string(); max_arity];
    for sig in unique_signatures.iter() {
      for (i, t) in sig.iter().enumerate() {
        if t == "int" {
          merged[i] = "int".to_string();
        } else if merged[i] != "int" {
          // keep string if no int was seen for this position
          merged[i] = "string".to_string();
        }
      }
    }
    base_probes.insert(base_name, merged);
  }

  // Generate probe definitions with base names
  for (name, signature) in &base_probes {
    if signature.is_empty() {
      content.push_str(&format!("    probe {name}();\n"));
    } else {
      let dtrace_types = signature
        .iter()
        .map(|t| match t.as_str() {
          "int" => "uint64_t",
          _ => "char*",
        })
        .collect::<Vec<_>>()
        .join(", ");
      content.push_str(&format!("    probe {name}({dtrace_types});\n"));
    }
  }
  content.push_str("};\n");

  fs::write("probes.d", content)?;

  // Generate the dynamic firing code for base probe names
  let mut firing_code = String::from("// Auto-generated probe firing code\n");
  firing_code
    .push_str("fn fire_probe_by_types(probe_name: &str, _types: &[String], args: &[String]) {\n");
  firing_code.push_str("    match probe_name {\n");
  for (name, signature) in &base_probes {
    firing_code.push_str(&format!("        \"{name}\" => {{\n"));
    if signature.is_empty() {
      firing_code.push_str(&format!("            nodeapp::{name}!(|| ());\n"));
    } else {
      let mut arg_conversions = Vec::new();
      for (i, arg_type) in signature.iter().enumerate() {
        let access_method = if i == 0 {
          "args.first()".to_string()
        } else {
          format!("args.get({i})")
        };
        match arg_type.as_str() {
          "int" => {
            arg_conversions.push(format!(
              "{access_method}.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)"
            ));
          }
          _ => {
            arg_conversions.push(format!(
              "{access_method}.map(|s| s.as_str()).unwrap_or(\"undefined\")"
            ));
          }
        }
      }

      match arg_conversions.len() {
        1 => {
          let a0 = &arg_conversions[0];
          firing_code.push_str(&format!("            let arg0 = {a0};\n"));
          firing_code.push_str(&format!("            nodeapp::{name}!(|| (arg0));\n"));
        }
        2 => {
          let a0 = &arg_conversions[0];
          let a1 = &arg_conversions[1];
          firing_code.push_str(&format!("            let arg0 = {a0};\n"));
          firing_code.push_str(&format!("            let arg1 = {a1};\n"));
          firing_code.push_str(&format!("            nodeapp::{name}!(|| (arg0, arg1));\n"));
        }
        3 => {
          let a0 = &arg_conversions[0];
          let a1 = &arg_conversions[1];
          let a2 = &arg_conversions[2];
          firing_code.push_str(&format!("            let arg0 = {a0};\n"));
          firing_code.push_str(&format!("            let arg1 = {a1};\n"));
          firing_code.push_str(&format!("            let arg2 = {a2};\n"));
          firing_code.push_str(&format!(
            "            nodeapp::{name}!(|| (arg0, arg1, arg2));\n"
          ));
        }
        _ => {}
      }
    }
    firing_code.push_str("        },\n");
  }

  firing_code.push_str("        _ => {}\n");
  firing_code.push_str("    }\n");
  firing_code.push_str("}\n");

  fs::write("src/generated_probes.rs", firing_code)?;

  Ok(())
}
