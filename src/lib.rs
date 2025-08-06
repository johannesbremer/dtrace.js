#![deny(clippy::all)]

use napi_derive::napi;
use napi::{Result, Env};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// For now, let's start with a simpler implementation without usdt until we get the basic structure working
// We'll add the actual DTrace functionality later

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
        
        // For now, just mark as enabled - we'll add actual DTrace registration later
        Ok(())
    }

    #[napi]
    pub fn disable(&self) -> Result<()> {
        if let Ok(mut enabled) = self.enabled.lock() {
            *enabled = false;
        }
        Ok(())
    }

    #[napi]
    pub fn fire(&self, probe_name: String) -> Result<()> {
        // Check if provider is enabled
        let enabled = self.enabled.lock().map(|e| *e).unwrap_or(false);
        if !enabled {
            return Ok(());
        }

        // For now, just succeed silently - we'll add actual probe firing later
        println!("Firing probe: {} in provider: {}", probe_name, self.name);
        
        Ok(())
    }
}

#[napi] 
impl DTraceProbe {
    #[napi]
    pub fn fire(&self) -> Result<()> {
        // For now, just succeed silently - we'll add actual probe firing later
        println!("Firing probe: {} in provider: {}", self.name, self.provider_name);
        
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
