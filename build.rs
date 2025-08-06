extern crate napi_build;

fn main() {
  napi_build::setup();
  usdt::Builder::new("probes.d").build().unwrap();
}
