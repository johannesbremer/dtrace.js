/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
// expected output:
//
// $ sudo dtrace -Zn 'nodeapp*:::gcprobe{ trace(arg0); }' -c 'node --expose_gc test/gc.js'
// Dtrace: description 'nodeapp*:::gcprobe' matched 0 probes
// dtrace: pid 66257 has exited
// CPU     ID                    FUNCTION:NAME
//   1   1778                  gcprobe:gcprobe        4320227343

var d = require('../dtrace-provider.ts')
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
