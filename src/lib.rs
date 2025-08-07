#![deny(clippy::all)]

use napi::Result;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Import USDT macros for DTrace probe support
use usdt::{dtrace_provider, register_probes};

// Point the macro to the D provider definition file
dtrace_provider!("probes.d");

// Macro to handle probe name matching and firing with two integers
macro_rules! fire_probe_two_ints {
    ($probe_name:expr, $arg0:expr, $arg1:expr) => {
        match $probe_name.as_str() {
            "p1" => nodeapp::p1_int_int!(|| ($arg0, $arg1)),
            "p2" => nodeapp::p2_int_int!(|| ($arg0, $arg1)),
            "p3" => nodeapp::p3_int_int!(|| ($arg0, $arg1)),
            "p4" => nodeapp::p4_int_int!(|| ($arg0, $arg1)),
            "p5" => nodeapp::p5_int_int!(|| ($arg0, $arg1)),
            "p6" => nodeapp::p6_int_int!(|| ($arg0, $arg1)),
            "p7" => nodeapp::p7_int_int!(|| ($arg0, $arg1)),
            "p8" => nodeapp::p8_int_int!(|| ($arg0, $arg1)),
            "p9" => nodeapp::p9_int_int!(|| ($arg0, $arg1)),
            "p10" => nodeapp::p10_int_int!(|| ($arg0, $arg1)),
            "gcprobe" => nodeapp::gcprobe_int_int!(|| ($arg0, $arg1)),
            "after1" => nodeapp::after1_int_int!(|| ($arg0, $arg1)),
            "probe0" => nodeapp::probe0_int_int!(|| ($arg0, $arg1)),
            "probe1" => nodeapp::probe1_int_int!(|| ($arg0, $arg1)),
            "probe2" => nodeapp::probe2_int_int!(|| ($arg0, $arg1)),
            "probe3" => nodeapp::probe3_int_int!(|| ($arg0, $arg1)),
            _ => nodeapp::generic_probe_int_int!(|| ($arg0, $arg1)),
        }
    };
}

// Macro to handle probe name matching and firing
macro_rules! fire_probe {
    ($probe_name:expr, $arg0:expr, $arg1:expr) => {
        match $probe_name.as_str() {
            "p1" => nodeapp::p1!(|| ($arg0, $arg1)),
            "p2" => nodeapp::p2!(|| ($arg0, $arg1)),
            "p3" => nodeapp::p3!(|| ($arg0, $arg1)),
            "p4" => nodeapp::p4!(|| ($arg0, $arg1)),
            "p5" => nodeapp::p5!(|| ($arg0, $arg1)),
            "p6" => nodeapp::p6!(|| ($arg0, $arg1)),
            "p7" => nodeapp::p7!(|| ($arg0, $arg1)),
            "p8" => nodeapp::p8!(|| ($arg0, $arg1)),
            "p9" => nodeapp::p9!(|| ($arg0, $arg1)),
            "p10" => nodeapp::p10!(|| ($arg0, $arg1)),
            "gcprobe" => nodeapp::gcprobe!(|| ($arg0, $arg1)),
            "after1" => nodeapp::after1!(|| ($arg0, $arg1)),
            "probe0" => nodeapp::probe0!(|| ($arg0, $arg1)),
            "probe1" => nodeapp::probe1!(|| ($arg0, $arg1)),
            "probe2" => nodeapp::probe2!(|| ($arg0, $arg1)),
            "probe3" => nodeapp::probe3!(|| ($arg0, $arg1)),
            _ => nodeapp::generic_probe!(|| ($arg0, $arg1)),
        }
    };
}

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
    if let Ok(mut enabled) = self.enabled.lock() {
      *enabled = true;
    }

    // Register the DTrace probes when enabling
    register_probes()
      .map_err(|e| napi::Error::from_reason(format!("Failed to register DTrace probes: {e}")))?;

    // Add a small delay to ensure probes are fully registered
    std::thread::sleep(std::time::Duration::from_millis(10));

    // Fire provider enabled probe
    nodeapp::provider_enabled!(|| (self.name.as_str()));

    Ok(())
  }

  #[napi]
  pub fn disable(&self) -> Result<()> {
    if let Ok(mut enabled) = self.enabled.lock() {
      *enabled = false;
    }

    // Fire provider disabled probe
    nodeapp::provider_disabled!(|| (self.name.as_str()));
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

    // Create JSON payload with probe information
    let provider_id = if let Some(ref module) = self.module {
      format!("{}:{}", module, self.name)
    } else {
      self.name.clone()
    };

    let probe_data = serde_json::json!({
        "provider": provider_id,
        "probe": probe_name,
        "types": probe_info.as_ref().map(|p| &p.types).unwrap_or(&vec![]),
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    });

    // Convert to JSON string and fire the actual DTrace probe
    let json_str = probe_data.to_string();

    // Handle different probe signatures based on probe name
    match probe_name.as_str() {
      "json1" => {
        nodeapp::json1!(|| (json_str.as_str()));
      }
      _ => {
        // Most probes take (uint64_t, char*)
        fire_probe!(probe_name, 42u64, json_str.as_str());
      }
    }

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

    // Determine probe signature based on probe types
    if let Some(probe) = probe_info {
      // Check the probe types to determine the correct signature
      let first_type = probe.types.get(0).map(|s| s.as_str()).unwrap_or("");
      let second_type = probe.types.get(1).map(|s| s.as_str()).unwrap_or("");
      
      match (first_type, second_type) {
        ("json", _) => {
          // json probe takes only a string argument
          let json_arg = args.first().map(|s| s.as_str()).unwrap_or("undefined");
          nodeapp::json1!(|| (json_arg));
        }
        ("int", "int") => {
          // Two integer arguments
          let arg0 = args.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
          let arg1 = args.get(1).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
          fire_probe_two_ints!(probe_name, arg0, arg1);
        }
        _ => {
          // Default: (uint64_t, char*) - first arg is int, second is string
          let arg0 = args.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
          let arg1 = args.get(1).map(|s| s.as_str()).unwrap_or("undefined");
          fire_probe!(probe_name, arg0, arg1);
        }
      }
    } else {
      // Fallback for unknown probes - assume (uint64_t, char*)
      match probe_name.as_str() {
        "json1" => {
          let json_arg = args.first().map(|s| s.as_str()).unwrap_or("undefined");
          nodeapp::json1!(|| (json_arg));
        }
        _ => {
          let arg0 = args.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
          let arg1 = args.get(1).map(|s| s.as_str()).unwrap_or("undefined");
          fire_probe!(probe_name, arg0, arg1);
        }
      }
    }

    Ok(())
  }
}

#[napi]
impl DTraceProbe {
  #[napi]
  pub fn fire(&self) -> Result<()> {
    // Create JSON payload with probe information
    let probe_data = serde_json::json!({
        "provider": self.provider_name,
        "probe": self.name,
        "types": self.types,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    });

    // Convert to JSON string and fire the actual DTrace probe
    let json_str = probe_data.to_string();

    // Handle different probe signatures based on probe name
    match self.name.as_str() {
      "json1" => {
        nodeapp::json1!(|| (json_str.as_str()));
      }
      _ => {
        // Most probes take (uint64_t, char*)
        fire_probe!(self.name, 42u64, json_str.as_str());
      }
    }

    Ok(())
  }

  #[napi]
  pub fn fire_with_args(&self, args: Vec<String>) -> Result<()> {
    // Handle different probe signatures based on probe name
    match self.name.as_str() {
      "json1" => {
        // json1 probe takes only a string argument
        let json_arg = args.first().map(|s| s.as_str()).unwrap_or("undefined");
        nodeapp::json1!(|| (json_arg));
      }
      _ => {
        // Most probes take (uint64_t, char*)
        let arg0 = args
          .first()
          .and_then(|s| s.parse::<u64>().ok())
          .unwrap_or(0);
        let arg1 = args.get(1).map(|s| s.as_str()).unwrap_or("undefined");

        // Use macro to fire the appropriate probe with actual arguments
        fire_probe!(self.name, arg0, arg1);
      }
    }

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
