import test from 'ava'

import { createDtraceProvider } from '../index.js'

test('DTrace provider creation', (t) => {
  const provider = createDtraceProvider('test-provider')
  t.truthy(provider)
  t.is(typeof provider.addProbe, 'function')
  t.is(typeof provider.enable, 'function')
  t.is(typeof provider.disable, 'function')
  t.is(typeof provider.fire, 'function')
})

test('DTrace probe creation and basic functionality', (t) => {
  const provider = createDtraceProvider('test-provider', 'test-module')
  const probe = provider.addProbe('test-probe', ['int', 'char *'])

  t.truthy(probe)
  t.is(typeof probe.fire, 'function')

  // Test basic lifecycle
  provider.enable()
  provider.fire('test-probe')
  probe.fire()
  provider.disable()

  t.pass('Basic DTrace provider functionality works')
})
