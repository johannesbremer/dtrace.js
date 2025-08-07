require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider.ts')
var provider = d.createDTraceProvider('nodeapp')
var probe = provider.addProbe('json1', 'json', 'json')
provider.enable()

var obj1 = { value: 'abc' }
var obj2 = { value: 'def' }

probe.fire(function (p) {
  return [obj1, obj2]
})
