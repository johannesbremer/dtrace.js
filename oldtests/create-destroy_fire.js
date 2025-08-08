/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider.ts')

for (var i = 0; i < 10; i++) {
  //gc();
  var dtp = d.createDTraceProvider('nodeapp')
  dtp.addProbe('probe1', 'int')
  dtp.enable()
  dtp.fire('probe1', function (p) {
    return [i]
  })
  //dtp.disable();
}
