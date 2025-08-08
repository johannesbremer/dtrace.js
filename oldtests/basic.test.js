/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'basic probes',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::p1{ printf("%d\\n", arg0); printf("%s\\n", copyinstr(arg1)) }',
      '-c',
      format('node -r ts-node/register %s/basic_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.falsy(exit_code, 'dtrace exited cleanly')
      t.is(traces[0], '42')
      t.is(traces[1], 'forty-two')
    },
  ),
)
