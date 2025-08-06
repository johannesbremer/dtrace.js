/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('tap').test
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'module name disambiguation',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'test*:::{printf("%s\\n%s\\n", probename, probemod)}',
      '-c',
      format('node %s/disambiguation_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.notOk(exit_code, 'dtrace exited cleanly')
      t.equal(traces.length, 8)
      t.equal(traces[0], traces[2])
      t.notEqual(traces[1], traces[3])
      t.equal(traces[4], traces[6])
      t.notEqual(traces[5], traces[7])
    },
  ),
)
