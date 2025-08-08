/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'probes where .fire() is called with arguments to pass to the callback',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::after1{ printf("%d\\n%s\\n%d\\n", arg0, copyinstr(arg1), arg2); }',
      '-c',
      format('node -r ts-node/register %s/args-after-cb-1_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.falsy(exit_code, 'dtrace exited cleanly')
      t.is(traces[0], '42')
      t.is(traces[1], 'forty-two')
      t.is(traces[2], '15')
    },
  ),
)
