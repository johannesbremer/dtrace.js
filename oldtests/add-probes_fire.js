/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider');
var dtp = d.createDTraceProvider("nodeapp");
dtp.addProbe("probe0", "int");
dtp.enable();
dtp.fire("probe0", function(p) { return [0]; });

for (var i = 1; i < 10; i++) {
    dtp.addProbe("probe" + i, "int");
    dtp.disable();
    dtp.enable();
    for (var j = 0; j < i; j++) {
        dtp.fire("probe" + j, function(p) { return [i]; });
    }
}
