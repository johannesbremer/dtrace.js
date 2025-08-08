/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
// node --expose_gc ...

var d = require('../dtrace-provider.ts')

for (var i = 0; i < 1000000; i++) {
  console.log('i: ' + i)
  var dtp = d.createDTraceProvider('testlibusdt' + i)
  var p = dtp.addProbe('gcprobe')
  dtp.enable()
  dtp.disable()
}
gc()
