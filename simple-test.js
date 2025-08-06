const { createDtraceProvider } = require('./index')

// Test basic functionality - create provider and add probe
console.log('Testing basic DTrace provider functionality...')

const provider = createDtraceProvider("testlibusdt")
console.log('Created provider:', provider)

const probe = provider.addProbe("probe1", ["int"])
console.log('Added probe:', probe)

provider.enable()
console.log('Provider enabled')

provider.fire("probe1")
console.log('Fired probe via provider')

probe.fire()
console.log('Fired probe directly')

provider.disable()
console.log('Provider disabled')

console.log('Basic test passed!')
