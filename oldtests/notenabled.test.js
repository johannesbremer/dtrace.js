/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var d = require('../dtrace-provider.ts')

test('firing probes when provider not enabled', function (t) {
  var dtp = d.createDTraceProvider('nodeapp')
  dtp.addProbe('probe1', 'int')
  //dtp.enable();
  dtp.fire('probe1', function (p) {
    t.falsy()
    return [1]
  })
  t.truthy(1, 'no problem')
})
