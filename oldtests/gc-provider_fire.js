/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var d = require('../dtrace-provider');

function mkProbe() {
    var dtp = d.createDTraceProvider("nodeapp");
    var probe = dtp.addProbe("gcprobe", "int");

    dtp.enable();

    return probe;
}

var p1 = mkProbe();

// run GC
gc();

// if the provider were GC'd, the USDT probes will be gone.
p1.fire(function() { return [ 5 ]; });
