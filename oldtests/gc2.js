require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
// node --expose_gc ...

var d = require('../dtrace-provider.ts')
var dtp = d.createDTraceProvider('testlibusdt')

// don't assign the returned probe object anywhere
var p = dtp.addProbe('gcprobe')
dtp.enable()

// run GC
gc()

// probe object should still be around
dtp.fire('gcprobe', function () {
  return []
})

dtp = 'something else'
gc()

p.fire(function () {
  return []
})

p = 'something else'

gc()
