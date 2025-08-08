/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider.ts')
var provider = d.createDTraceProvider('nodeapp')
var probe = provider.addProbe('after1', 'int', 'char *', 'int')
provider.enable()

function fireCb(n1, str2, n2) {
  return [n1, str2, n2 + 5]
}

probe.fire(fireCb, 42, 'forty-two', 10)
