#!/usr/bin/env node
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/

const { createDtraceProvider } = require('../index.js')

console.log('DTrace Integration Test')
console.log('======================')

// Create a provider with some test probes
const provider = createDtraceProvider('nodeapp', 'mymodule')
const probe1 = provider.addProbe('request_start', ['string', 'int'])
const probe2 = provider.addProbe('request_end', ['string', 'int', 'string'])

// Enable the provider
provider.enable()
console.log('✓ Provider enabled')

// Show PID for dtrace commands
console.log(`Process PID: ${process.pid}`)
console.log('You can now run: sudo dtrace -l -n "*nodeapp*"')
console.log(
  'Or trace specific probes: sudo dtrace -n "nodeapp*:::request_start { printf(\\"Request started: %s\\\\n\\", copyinstr(arg0)); }"',
)
console.log('')

let counter = 0

// Fire probes periodically
const interval = setInterval(() => {
  counter++

  // Fire via provider with args
  provider.fire_with_args('request_start', [`/api/users/${counter}`, counter.toString()])

  // Simulate some work
  setTimeout(() => {
    // Fire via probe directly with args
    probe2.fire_with_args([`/api/users/${counter}`, counter.toString(), 'success'])
  }, 100)

  console.log(`Fired probe set ${counter}`)

  if (counter >= 5) {
    clearInterval(interval)
    provider.disable()
    console.log('✓ Test completed')
    process.exit(0)
  }
}, 2000)

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\\nCleaning up...')
  clearInterval(interval)
  provider.disable()
  process.exit(0)
})
