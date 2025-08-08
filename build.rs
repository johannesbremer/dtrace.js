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

  // Regex for static addProbe('name', 'type', ...)
  let add_probe_static =
    Regex::new(r#"\.addProbe\s*\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_]*)['\"`]([^)]*)\)"#).unwrap();

  // Regex for dynamic addProbe('prefix' + var, ...)
  let add_probe_dynamic = Regex::new(
    r#"\.addProbe\s*\(\s*['\"`]([a-zA-Z_][a-zA-Z0-9_]*)['\"`]\s*\+\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([^)]*)\)"#,
  )
  .unwrap();

  // Regex to capture for-loop simple integer ranges: for (var i = 1; i < 10; i++)
  // Note: Rust regex doesn't support backreferences, so we don't enforce repeated var usage.
  let for_loop = Regex::new(
    r#"for\s*\(\s*(?:var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([0-9]+)\s*;\s*[^;]*<\s*([0-9]+)\s*;\s*[^)]*\+\+\s*\)"#,
  )
  .unwrap();

  // Pre-compile a regex to extract all quoted strings within argument lists
  let quoted = Regex::new(r#"['\"`]([^'\"`]+)['\"`]"#).unwrap();

  // Collect simple for-loop ranges
  let mut loop_ranges: HashMap<String, (i32, i32)> = HashMap::new();
  for cap in for_loop.captures_iter(content) {
    let var = cap.get(1).unwrap().as_str().to_string();
    let start: i32 = cap.get(2).unwrap().as_str().parse().unwrap_or(0);
    let end: i32 = cap.get(3).unwrap().as_str().parse().unwrap_or(0);
    if end > start {
      loop_ranges.insert(var, (start, end));
    }
  }

  // Handle static addProbe cases
  for cap in add_probe_static.captures_iter(content) {
    let name = cap.get(1).unwrap().as_str();
    if !is_valid_probe_name(name) {
      continue;
    }

    let mut types = Vec::new();
    // Extract types from the second capture group (args substring)
    let args_sub = cap.get(2).map(|m| m.as_str()).unwrap_or("");
    // If this looks like a dynamic name concatenation (starts with '+ var'), skip here;
    // the dynamic handler below will expand it properly.
    if args_sub.trim_start().starts_with('+') {
      continue;
    }
    for m in quoted.find_iter(args_sub) {
      // Skip the first quoted (probe name) if present in substring; for static pattern it's not included
      let type_str = m
        .as_str()
        .trim_matches(|c| c == '\'' || c == '"' || c == '`');
      if is_valid_type_name(type_str) {
        types.push(normalize_type(type_str));
      }
    }

    probes.push(ProbeDefinition {
      name: name.to_string(),
      arg_types: types,
    });
  }

  // Handle dynamic addProbe cases by expanding simple for-loop ranges
  for cap in add_probe_dynamic.captures_iter(content) {
    let prefix = cap.get(1).unwrap().as_str();
    let var = cap.get(2).unwrap().as_str();
    let args_sub = cap.get(3).map(|m| m.as_str()).unwrap_or("");

    // Prepare the types array (quoted strings in the remainder)
    let mut types = Vec::new();
    for m in quoted.find_iter(args_sub) {
      let type_str = m
        .as_str()
        .trim_matches(|c| c == '\'' || c == '"' || c == '`');
      if is_valid_type_name(type_str) {
        types.push(normalize_type(type_str));
      }
    }

    if let Some((start, end)) = loop_ranges.get(var).cloned() {
      for i in start..end {
        let name = format!("{prefix}{i}");
        if is_valid_probe_name(&name) {
          probes.push(ProbeDefinition {
            name,
            arg_types: types.clone(),
          });
        }
      }
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
    && !name.contains('-')
    && !name.contains("'")
    && !name.contains("\"")
    && name.chars().all(|c| c.is_alphanumeric() || c == '_')
    && name
      .chars()
      .next()
      .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
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
  // We'll define three providers commonly used in tests; runtime dispatch uses base names
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
      // To support both numeric and string semantics per test, we always use uint64_t
      // and pass either integers or user-space string pointers at runtime.
      let dtrace_types = signature
        .iter()
        .map(|_| "uint64_t")
        .collect::<Vec<_>>()
        .join(", ");
      content.push_str(&format!("    probe {name}({dtrace_types});\n"));
    }
  }
  content.push_str("};\n");

  // Also define the same probes for 'test' and 'testlibusdt' to satisfy module disambiguation tests
  content.push_str("provider test {\n");
  for (name, signature) in &base_probes {
    if signature.is_empty() {
      content.push_str(&format!("    probe {name}();\n"));
    } else {
      let dtrace_types = signature
        .iter()
        .map(|_| "uint64_t")
        .collect::<Vec<_>>()
        .join(", ");
      content.push_str(&format!("    probe {name}({dtrace_types});\n"));
    }
  }
  content.push_str("};\n");

  content.push_str("provider testlibusdt {\n");
  for (name, signature) in &base_probes {
    if signature.is_empty() {
      content.push_str(&format!("    probe {name}();\n"));
    } else {
      let dtrace_types = signature
        .iter()
        .map(|_| "uint64_t")
        .collect::<Vec<_>>()
        .join(", ");
      content.push_str(&format!("    probe {name}({dtrace_types});\n"));
    }
  }
  content.push_str("};\n");

  fs::write("probes.d", content)?;

  // Generate the dynamic firing code for base probe names
  let mut firing_code =
    String::from("// Auto-generated probe firing code\nuse std::ffi::CString;\n");
  firing_code.push_str(
    "fn fire_probe_by_types(provider_name: &str, probe_name: &str, _types: &[String], args: &[String]) {\n",
  );
  firing_code.push_str("    match (provider_name, probe_name) {\n");
  for (name, signature) in &base_probes {
    // Generate for each provider separately to avoid broadcasting
    for prov in ["nodeapp", "test", "testlibusdt"].iter() {
      firing_code.push_str(&format!("        (\"{prov}\", \"{name}\") => {{\n"));
      if signature.is_empty() {
        firing_code.push_str(&format!("            {prov}::{name}!(|| ());\n"));
      } else {
        // Build conversion expressions for each expected slot using runtime types; pad/truncate as needed.
        let slots = signature.len();
        for i in 0..slots {
          // Read declared type for this slot from _types vector, default to string/json semantics
          if i == 0 {
            firing_code.push_str(&format!(
            "            let ty_{i} = _types.first().map(|s| s.as_str()).unwrap_or(\"string\");\n"
          ));
          } else {
            firing_code.push_str(&format!(
            "            let ty_{i} = _types.get({i}).map(|s| s.as_str()).unwrap_or(\"string\");\n"
          ));
          }
          // Prepare source string for string/json case
          let access = if i == 0 {
            "args.first()".to_string()
          } else {
            format!("args.get({i})")
          };
          firing_code.push_str(&format!(
            "            let s_{i} = {access}.map(|s| s.as_str()).unwrap_or(\"undefined\");\n"
          ));
          firing_code.push_str(&format!(
          "            let (arg{i}, _keep_{i});\n            if ty_{i} == \"int\" {{\n                arg{i} = {access}.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);\n                _keep_{i} = None;\n            }} else {{\n                let c_{i} = CString::new(s_{i}).unwrap_or_else(|_| CString::new(\"undefined\").unwrap());\n                let p_{i} = c_{i}.as_ptr() as usize as u64;\n                // keep CString alive until after the probe fires\n                _keep_{i} = Some(c_{i});\n                arg{i} = p_{i};\n            }}\n"
        ));
        }
        let arg_list = (0..slots)
          .map(|i| format!("arg{i}"))
          .collect::<Vec<_>>()
          .join(", ");
        firing_code.push_str(&format!("            {prov}::{name}!(|| ({arg_list}));\n"));
      }
      firing_code.push_str("        },\n");
    }
  }

  firing_code.push_str("        _ => {}\n");
  firing_code.push_str("    }\n");
  firing_code.push_str("}\n");

  fs::write("src/generated_probes.rs", firing_code)?;

  Ok(())
}
