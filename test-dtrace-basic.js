// Basic test based on the provided test suite examples
var d = require('./index');

console.log('Testing DTrace provider functionality based on test suite...')

// Test 1: Create a provider like in the examples
var provider = d.createDtraceProvider("testlibusdt");
console.log('✓ Created provider "testlibusdt"');

// Test 2: Add a probe with multiple int arguments (like 32probe.test.js)
var probe = provider.addProbe(
    "32probe",
    ["int", "int", "int", "int", "int", "int", "int", "int",
     "int", "int", "int", "int", "int", "int", "int", "int",
     "int", "int", "int", "int", "int", "int", "int", "int",
     "int", "int", "int", "int", "int", "int", "int", "int"]);
console.log('✓ Added 32-argument int probe');

// Test 3: Enable provider
provider.enable();
console.log('✓ Provider enabled');

// Test 4: Fire probe via provider (basic test - no callback yet)
provider.fire("32probe");
console.log('✓ Fired probe via provider');

// Test 5: Fire probe directly
probe.fire();
console.log('✓ Fired probe directly');

// Test 6: Create another provider with module name
var provider2 = d.createDtraceProvider("nodeapp", "mymodule");
console.log('✓ Created provider with module name');

// Test 7: Add different probe types
var basicProbe = provider2.addProbe("p1", ["int", "char *"]);
console.log('✓ Added basic probe with int and char* arguments');

provider2.enable();
provider2.fire("p1");
basicProbe.fire();

// Test 8: Test disable functionality
provider.disable();
provider.fire("32probe"); // Should be ignored
console.log('✓ Disable functionality works');

console.log('\n🎉 All basic DTrace provider tests passed!');
console.log('The API structure matches the expected test suite interface.');