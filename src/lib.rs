#![deny(clippy::all)]

use napi::Result;
use napi_derive::napi;
use serde_json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// Import USDT macros for DTrace probe support
use usdt::{dtrace_provider, register_probes};

// Point the macro to the D provider definition file
dtrace_provider!("probes.d");

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
      .map_err(|e| napi::Error::from_reason(format!("Failed to register DTrace probes: {}", e)))?;

    // Fire provider enabled probe
    dtrace_provider::provider_enabled!(|| (&self.name));

    println!("DTrace provider '{}' enabled", self.name);

    Ok(())
  }

  #[napi]
  pub fn disable(&self) -> Result<()> {
    if let Ok(mut enabled) = self.enabled.lock() {
      *enabled = false;
    }

    // Fire provider disabled probe
    dtrace_provider::provider_disabled!(|| (&self.name));

    println!("DTrace provider '{}' disabled", self.name);
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
    dtrace_provider::generic_probe!(|| (&json_str));

    println!("Firing DTrace probe: {}:{}", provider_id, probe_name);

    if let Some(ref probe) = probe_info {
      println!("Probe argument types: {:?}", probe.types);
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

    // Create JSON payload with probe information and arguments
    let provider_id = if let Some(ref module) = self.module {
      format!("{}:{}", module, self.name)
    } else {
      self.name.clone()
    };

    let probe_data = serde_json::json!({
        "provider": provider_id,
        "probe": probe_name,
        "types": probe_info.as_ref().map(|p| &p.types).unwrap_or(&vec![]),
        "args": args,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    });

    // Convert to JSON string and fire the actual DTrace probe
    let json_str = probe_data.to_string();
    dtrace_provider::generic_probe!(|| (&json_str));

    println!(
      "Firing DTrace probe: {}:{} with args: {:?}",
      provider_id, probe_name, args
    );

    if let Some(ref probe) = probe_info {
      println!("Probe argument types: {:?}", probe.types);
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
    dtrace_provider::generic_probe!(|| (&json_str));

    println!("Firing DTrace probe: {}:{}", self.provider_name, self.name);
    println!("Probe argument types: {:?}", self.types);

    Ok(())
  }

  #[napi]
  pub fn fire_with_args(&self, args: Vec<String>) -> Result<()> {
    // Create JSON payload with probe information and arguments
    let probe_data = serde_json::json!({
        "provider": self.provider_name,
        "probe": self.name,
        "types": self.types,
        "args": args,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    });

    // Convert to JSON string and fire the actual DTrace probe
    let json_str = probe_data.to_string();
    dtrace_provider::generic_probe!(|| (&json_str));

    println!(
      "Firing DTrace probe: {}:{} with args: {:?}",
      self.provider_name, self.name, args
    );
    println!("Probe argument types: {:?}", self.types);

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
