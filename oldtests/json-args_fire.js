/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider')
var provider = d.createDTraceProvider('nodeapp')
var probe = provider.addProbe('json1', 'json')
provider.enable()

var obj = new Object()
obj.foo = 42
obj.bar = 'forty-two'

probe.fire(function (p) {
  return [obj]
})
