require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider.ts')
var provider = d.createDTraceProvider('nodeapp')
var probe = provider.addProbe('p1', 'int', 'int', 'char *')
provider.enable()

probe.fire(function (p) {
  return [42]
})
