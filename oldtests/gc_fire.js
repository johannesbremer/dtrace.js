/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider')
var dtp = d.createDTraceProvider('nodeapp')

// don't assign the returned probe object anywhere
dtp.addProbe('gcprobe', 'int')
dtp.enable()

// run GC
gc()

// probe object should still be around
dtp.fire('gcprobe', function () {
  return []
})
