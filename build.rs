extern crate napi_build;
use serde::Deserialize;
use std::fs;

#[derive(Debug, Deserialize, Clone)]
struct ManifestProbe {
  name: String,
  arg_types: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ManifestV1 {
  #[allow(dead_code)]
  #[serde(rename = "schemaVersion")]
  schema_version: u32,
  provider: String,
  #[allow(dead_code)]
  module: Option<String>,
  probes: Vec<ManifestProbe>,
}

fn main() {
  let manifest_path =
    std::env::var("DTRACE_MANIFEST").unwrap_or_else(|_| "probes.manifest.json".into());
  println!("cargo:rerun-if-changed={manifest_path}");
  let data = fs::read_to_string(&manifest_path)
    .expect("Missing probes manifest. Run 'npm run build-probes' first.");
  let manifest: ManifestV1 = serde_json::from_str(&data).expect("Invalid probes manifest JSON");
  if manifest.schema_version != 1 {
    panic!("Unsupported manifest schemaVersion");
  }
  generate_from_manifest(&manifest).expect("Failed to generate probe sources");
  napi_build::setup();
  usdt::Builder::new("probes.d").build().unwrap();
}

fn generate_from_manifest(m: &ManifestV1) -> std::io::Result<()> {
  let mut content = String::new();
  content.push_str(&format!("provider {} {{\n", m.provider));
  for p in &m.probes {
    if p.arg_types.is_empty() {
      content.push_str(&format!("    probe {}();\n", p.name));
    } else {
      let dtrace_types = p
        .arg_types
        .iter()
        .map(|_| "uint64_t")
        .collect::<Vec<_>>()
        .join(", ");
      content.push_str(&format!("    probe {}({});\n", p.name, dtrace_types));
    }
  }
  content.push_str("};\n");
  fs::write("probes.d", content)?;

  // Firing code: single provider dispatch
  let mut firing = String::from("// Auto-generated from manifest\nuse std::ffi::CString;\n");
  firing.push_str("fn fire_probe_by_types(provider_name: &str, probe_name: &str, _types: &[String], args: &[String]) {\n");
  firing.push_str(&format!(
    "    if provider_name != \"{}\" {{ return; }}\n",
    m.provider
  ));
  firing.push_str("    match probe_name {\n");
  for p in &m.probes {
    if p.arg_types.is_empty() {
      firing.push_str(&format!(
        "        \"{}\" => {{ {}::{}!(|| ()); }},\n",
        p.name, m.provider, p.name
      ));
    } else {
      let slot_count = p.arg_types.len();
      firing.push_str(&format!("        \"{}\" => {{\n", p.name));
      for i in 0..slot_count {
        if i == 0 {
          // Use first() instead of get(0) to satisfy clippy::get_first
          firing.push_str(
            "            let ty_0 = _types.first().map(|s| s.as_str()).unwrap_or(\"string\");\n",
          );
          firing.push_str(
            "            let s_0 = args.first().map(|s| s.as_str()).unwrap_or(\"undefined\");\n",
          );
        } else {
          firing.push_str(&format!(
            "            let ty_{i} = _types.get({i}).map(|s| s.as_str()).unwrap_or(\"string\");\n"
          ));
          firing.push_str(&format!(
            "            let s_{i} = args.get({i}).map(|s| s.as_str()).unwrap_or(\"undefined\");\n"
          ));
        }
        firing.push_str(&format!("            let (arg{i}, _keep_{i});\n            if ty_{i} == \"int\" || ty_{i} == \"uint\" {{\n                arg{i} = s_{i}.parse::<u64>().unwrap_or(0);\n                _keep_{i} = None;\n            }} else {{\n                let c_{i} = CString::new(s_{i}).unwrap_or_else(|_| CString::new(\"undefined\").unwrap());\n                arg{i} = c_{i}.as_ptr() as usize as u64;\n                _keep_{i} = Some(c_{i});\n            }}\n"));
      }
      let arg_list = (0..slot_count)
        .map(|i| format!("arg{i}"))
        .collect::<Vec<_>>()
        .join(", ");
      firing.push_str(&format!(
        "            {}::{}!(|| ({}));\n",
        m.provider, p.name, arg_list
      ));
      firing.push_str("        },\n");
    }
  }
  firing.push_str("        _ => {}\n    }\n}\n");
  fs::write("src/generated_probes.rs", firing)?;
  Ok(())
}
