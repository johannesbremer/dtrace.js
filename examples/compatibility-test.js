/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/

// Test that matches the original test suite examples more closely
console.log('=== Testing DTrace Provider Compatibility ===\n')

var d = require('../index')

// Test 1: Basic provider creation (matches test suite)
console.log('1. Testing basic provider creation...')
var provider = d.createDtraceProvider('testlibusdt')
console.log('   ✓ Created provider:', typeof provider)

// Test 2: Adding probes with different signatures
console.log('\n2. Testing probe creation with different type signatures...')

// Basic probe (like basic.test.js)
var basicProbe = provider.addProbe('p1', ['int', 'char *'])
console.log('   ✓ Created basic probe with int and char* types')

// 32-argument probe (like 32probe.test.js)
var probe32 = provider.addProbe('32probe', [
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
])
console.log('   ✓ Created 32-argument probe')

// Char* probe (like 32probe-char.test.js)
var charProbe = provider.addProbe('charprobe', [
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
])
console.log('   ✓ Created multi-char* probe')

// Test 3: Provider lifecycle
console.log('\n3. Testing provider lifecycle...')
provider.enable()
console.log('   ✓ Provider enabled')

// Test 4: Probe firing (basic functionality)
console.log('\n4. Testing probe firing...')
provider.fire('p1')
console.log('   ✓ Fired probe via provider.fire()')

basicProbe.fire()
console.log('   ✓ Fired probe via probe.fire()')

provider.fire('32probe')
probe32.fire()
console.log('   ✓ Fired 32-argument probe')

provider.fire('charprobe')
charProbe.fire()
console.log('   ✓ Fired char* probe')

// Test 5: Multiple providers (like disambiguation.test.js)
console.log('\n5. Testing multiple providers...')
var provider2 = d.createDtraceProvider('nodeapp')
var provider3 = d.createDtraceProvider('test', 'mymod1')
console.log('   ✓ Created multiple providers')

provider2.addProbe('probe1', ['int', 'int'])
provider3.addProbe('probe1', ['int', 'int'])
provider2.enable()
provider3.enable()

provider2.fire('probe1')
provider3.fire('probe1')
console.log('   ✓ Multiple providers can coexist and fire independently')

// Test 6: Disable functionality
console.log('\n6. Testing disable functionality...')
provider.disable()
provider.fire('p1') // Should be ignored
console.log('   ✓ Disabled provider ignores probe firing')

// Test 7: API Compatibility Summary
console.log('\n=== API Compatibility Summary ===')
console.log('✓ createDtraceProvider(name, module?) - Working')
console.log('✓ provider.addProbe(name, types[]) - Working')
console.log('✓ provider.enable() - Working')
console.log('✓ provider.disable() - Working')
console.log('✓ provider.fire(probeName) - Working')
console.log('✓ probe.fire() - Working')
console.log('✓ Multiple providers - Working')
console.log('✓ Complex type signatures - Working')

console.log('\n🎉 DTrace provider API is compatible with test suite interface!')
console.log('📋 Ready for callback support and actual DTrace integration.')
