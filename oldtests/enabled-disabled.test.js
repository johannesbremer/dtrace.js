/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'enabling and disabling a provider',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp*:::{ printf("%d\\n", arg0); }',
      '-c',
      format('node -r ts-node/register %s/enabled-disabled_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.falsy(exit_code, 'dtrace exited cleanly')
      t.is(traces.length, 11)
      traces.sort(function (a, b) {
        return a - b
      })
      for (var i = 0; i < 10; i++) {
        t.is(traces[i], [i].toString())
      }
    },
  ),
)
