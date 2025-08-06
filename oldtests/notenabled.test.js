require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('tap').test
var d = require('../dtrace-provider.ts')

test('firing probes when provider not enabled', function (t) {
  var dtp = d.createDTraceProvider('nodeapp')
  dtp.addProbe('probe1', 'int')
  //dtp.enable();
  dtp.fire('probe1', function (p) {
    t.notOk()
    return [1]
  })
  t.ok(1, 'no problem')
  t.end()
})
