# DTrace Provider for Node.js

A Node.js module that provides DTrace USDT (User-Level Statically Defined Tracing) probe support, built with Rust and NAPI-RS.

## Installation

```bash
npm install dtrace-provider
```

## Usage

### Basic Example

```javascript
const d = require('dtrace-provider');

// Create a DTrace provider
const provider = d.createDtraceProvider("myapp");

// Add a probe with argument types
const probe = provider.addProbe("request", ["int", "char *"]);

// Enable the provider
provider.enable();

// Fire probes
provider.fire("request");  // Fire via provider
probe.fire();              // Fire via probe object

// Disable when done
provider.disable();
```

### Advanced Example

```javascript
const d = require('dtrace-provider');

// Create provider with module name for disambiguation
const provider = d.createDtraceProvider("myapp", "module1");

// Add probes with different argument types
const basicProbe = provider.addProbe("basic", ["int", "char *"]);
const complexProbe = provider.addProbe("complex", [
  "int", "int", "int", "char *", "char *"
]);

provider.enable();

// Fire probes
provider.fire("basic");
basicProbe.fire();
provider.fire("complex");
complexProbe.fire();
```

## API Reference

### `createDtraceProvider(name, [module])`

Creates a new DTrace provider.

- `name` (string): The provider name
- `module` (string, optional): Module name for disambiguation

Returns a `DTraceProvider` instance.

### DTraceProvider

#### `addProbe(name, types)`

Adds a probe to the provider.

- `name` (string): The probe name
- `types` (array): Array of argument type strings (e.g., `["int", "char *", "json"]`)

Returns a `DTraceProbe` instance.

#### `enable()`

Enables the provider, allowing probes to fire.

#### `disable()`

Disables the provider, causing probe firing to be ignored.

#### `fire(probeName)`

Fires a probe by name.

- `probeName` (string): The name of the probe to fire

### DTraceProbe

#### `fire()`

Fires the probe.

## Supported Argument Types

- `int` - Integer values
- `char *` - String values  
- `json` - JSON objects (framework ready)

## Platform Support

This module is designed to work on platforms that support DTrace:

- macOS
- Solaris/illumos
- FreeBSD
- Linux (with DTrace support)

On platforms without DTrace support, the module will function normally but probes will not be visible to DTrace tools.

## Development Status

✅ **Core API Complete**
- Provider creation and management
- Probe definition and firing
- Enable/disable lifecycle
- Multiple provider support
- Type system framework

🚧 **In Development**
- Callback function support for dynamic arguments
- Actual USDT probe integration
- DTrace command compatibility testing

## Examples

See the test files for comprehensive examples:

- `basic_fire.js` - Basic probe firing
- `compatibility-test.js` - Comprehensive API test
- `final-test.js` - Full test suite compatibility

## License

MIT

## Contributing

This project is built with NAPI-RS and Rust. To contribute:

1. Install Rust and Node.js
2. Run `pnpm install`
3. Run `pnpm build` to compile
4. Run `pnpm test` to test

## Compatibility

This implementation is designed to be compatible with the original `node-dtrace-provider` test suite and API.
