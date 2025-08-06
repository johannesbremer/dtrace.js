/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/

const { createDtraceProvider } = require('../index.js')

console.log('Testing DTrace provider with JSON argument support...')

// Create provider
const provider = createDtraceProvider('json-test-provider', 'mymodule')
console.log('Created provider:', typeof provider)

// Add some probes with different argument types
const stringProbe = provider.addProbe('string_event', ['string'])
const numberProbe = provider.addProbe('number_event', ['int', 'double'])
const mixedProbe = provider.addProbe('mixed_event', ['string', 'int', 'string'])

console.log('Added probes')

// Enable the provider
provider.enable()
console.log('Provider enabled')

// Test firing probes with arguments using the new method
console.log('\n--- Testing fire_with_args method ---')

// Fire string probe with arguments
provider.fire_with_args('string_event', ['Hello, DTrace!'])

// Fire number probe with arguments
provider.fire_with_args('number_event', ['42', '3.14159'])

// Fire mixed probe with arguments
provider.fire_with_args('mixed_event', ['user_action', '123', 'success'])

// Test the probe objects directly with arguments
console.log('\n--- Testing probe.fire_with_args method ---')

stringProbe.fire_with_args(['Direct probe firing'])
numberProbe.fire_with_args(['99', '2.718'])
mixedProbe.fire_with_args(['direct_call', '456', 'completed'])

// Test without arguments (original behavior)
console.log('\n--- Testing original fire methods ---')
provider.fire('string_event')
stringProbe.fire()

// Disable provider
provider.disable()
console.log('\nJSON probe test completed!')
