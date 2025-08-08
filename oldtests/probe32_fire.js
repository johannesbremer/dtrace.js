/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
// see probe32.test.js

var d = require('../dtrace-provider.ts')

var provider = d.createDTraceProvider('testlibusdt')
var probe = provider.addProbe(
  'probe32',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
  'int',
)

provider.enable()

var args = []
for (var n = 1; n <= 32; n++) {
  args.push(n)
  probe.fire(function (p) {
    return args
  })
}
