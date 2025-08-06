#![deny(clippy::all)]

use napi_derive::napi;
use napi::Result;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
// use usdt::{register_probes, dtrace_provider};

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
        
        // For now, just mark as enabled
        // TODO: Add actual DTrace registration when USDT integration is ready
        println!("DTrace provider '{}' enabled", self.name);
        
        Ok(())
    }

    #[napi]
    pub fn disable(&self) -> Result<()> {
        if let Ok(mut enabled) = self.enabled.lock() {
            *enabled = false;
        }
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
        let probe_types = if let Ok(probes) = self.probes.lock() {
            probes.get(&probe_name).map(|p| p.types.clone())
        } else {
            None
        };

        // Log probe firing with module information for debugging
        let provider_id = if let Some(ref module) = self.module {
            format!("{}:{}", module, self.name)
        } else {
            self.name.clone()
        };
        
        println!("Firing DTrace probe: {}:{}", provider_id, probe_name);
        
        if let Some(types) = probe_types {
            println!("Probe argument types: {:?}", types);
        }
        
        // TODO: Add actual DTrace probe firing when USDT integration is ready
        
        Ok(())
    }
}

#[napi] 
impl DTraceProbe {
    #[napi]
    pub fn fire(&self) -> Result<()> {
        println!("Firing DTrace probe: {}:{}", self.provider_name, self.name);
        println!("Probe argument types: {:?}", self.types);
        
        // TODO: Add actual DTrace probe firing when USDT integration is ready
        
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
