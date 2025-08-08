#![deny(clippy::all)]

use napi::Result;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Import USDT macros for DTrace probe support
use usdt::{dtrace_provider, register_probes};

// Point the macro to the D provider definition file
dtrace_provider!("probes.d");

// Include the auto-generated probe firing code
include!("generated_probes.rs");

// Define the DTrace provider struct
#[napi]
#[derive(Clone)]
pub struct DTraceProvider {
  name: String,
  module: Option<String>,
  probes: Arc<Mutex<HashMap<String, DTraceProbe>>>,
  enabled: Arc<Mutex<bool>>,
}

// Define the DTrace probe struct
#[napi]
#[derive(Clone)]
pub struct DTraceProbe {
  name: String,
  types: Vec<String>,
  provider_name: String,
}

#[napi]
impl DTraceProvider {
  #[napi]
  pub fn add_probe(&mut self, name: String, types: Vec<String>) -> DTraceProbe {
    let probe = DTraceProbe {
      name: name.clone(),
      types,
      provider_name: self.name.clone(),
    };

    if let Ok(mut probes) = self.probes.lock() {
      probes.insert(name.clone(), probe.clone());
    }

    probe
  }

  #[napi]
  pub fn enable(&self) -> Result<()> {
    // Make enable idempotent: only register once
    let mut should_register = false;
    if let Ok(mut enabled) = self.enabled.lock() {
      if !*enabled {
        *enabled = true;
        should_register = true;
      }
    }

    if should_register {
      // Register the DTrace probes when enabling
      register_probes()
        .map_err(|e| napi::Error::from_reason(format!("Failed to register DTrace probes: {e}")))?;

      // Add a small delay to ensure probes are fully registered
      std::thread::sleep(std::time::Duration::from_millis(10));
    }

    Ok(())
  }

  #[napi]
  pub fn disable(&self) -> Result<()> {
    if let Ok(mut enabled) = self.enabled.lock() {
      *enabled = false;
    }

    // No-op: we don't emit provider lifecycle probes in this implementation
    Ok(())
  }

  #[napi]
  pub fn fire(&self, probe_name: String) -> Result<()> {
    // Check if provider is enabled
    let enabled = self.enabled.lock().map(|e| *e).unwrap_or(false);
    if !enabled {
      return Ok(());
    }

    // Get the probe to access its types
    let probe_info = if let Ok(probes) = self.probes.lock() {
      probes.get(&probe_name).cloned()
    } else {
      None
    };

    // Build default args based on declared probe types
    let (types, args) = if let Some(p) = probe_info {
      let mut args: Vec<String> = Vec::with_capacity(p.types.len());
      for t in &p.types {
        match t.as_str() {
          "int" => args.push("0".to_string()),
          // For string/json, tests expect literal 'undefined' when missing
          _ => args.push("undefined".to_string()),
        }
        // Touch optional module to avoid dead_code warnings in some build modes
        if let Some(m) = &self.module {
          let _ = m.len();
        }
      }
      (p.types, args)
    } else {
      // Unknown probe: no args
      (Vec::<String>::new(), Vec::<String>::new())
    };

    // Fire the probe using dynamic dispatch
    fire_probe_by_types(&probe_name, &types, &args);

    Ok(())
  }

  #[napi]
  pub fn fire_with_args(&self, probe_name: String, args: Vec<String>) -> Result<()> {
    // Check if provider is enabled
    let enabled = self.enabled.lock().map(|e| *e).unwrap_or(false);
    if !enabled {
      return Ok(());
    }

    // Get the probe to access its types
    let probe_info = if let Ok(probes) = self.probes.lock() {
      probes.get(&probe_name).cloned()
    } else {
      None
    };

    // Add a small delay to ensure DTrace is ready
    std::thread::sleep(std::time::Duration::from_micros(100));

    // Use the probe types if available, otherwise infer from arguments
    let types = if let Some(probe) = probe_info {
      probe.types
    } else {
      args
        .iter()
        .map(|arg| {
          if arg.parse::<u64>().is_ok() {
            "int".to_string()
          } else {
            "string".to_string()
          }
        })
        .collect()
    };

    // Fire the probe using dynamic dispatch
    fire_probe_by_types(&probe_name, &types, &args);

    Ok(())
  }
}

#[napi]
impl DTraceProbe {
  #[napi]
  pub fn fire(&self) -> Result<()> {
    // Touch provider_name to avoid dead_code warning when not otherwise used
    let _ = self.provider_name.len();

    // Build default args based on declared probe types
    let mut args: Vec<String> = Vec::with_capacity(self.types.len());
    for t in &self.types {
      match t.as_str() {
        "int" => args.push("0".to_string()),
        _ => args.push("undefined".to_string()),
      }
    }

    fire_probe_by_types(&self.name, &self.types, &args);

    Ok(())
  }

  #[napi(js_name = "fireWithArgs")]
  pub fn fire_with_args(&self, args: Vec<String>) -> Result<()> {
    // Use the probe's stored types for dynamic dispatch
    fire_probe_by_types(&self.name, &self.types, &args);
    Ok(())
  }
}

// Main function to create a DTrace provider
#[napi]
pub fn create_dtrace_provider(name: String, module: Option<String>) -> DTraceProvider {
  DTraceProvider {
    name,
    module,
    probes: Arc::new(Mutex::new(HashMap::new())),
    enabled: Arc::new(Mutex::new(false)),
  }
}

// Alias for compatibility with old tests (uppercase D)
#[napi(js_name = "createDTraceProvider")]
pub fn create_d_trace_provider(name: String, module: Option<String>) -> DTraceProvider {
  create_dtrace_provider(name, module)
}
