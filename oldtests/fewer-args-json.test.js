/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'firing JSON probe with too few arguments',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::p1{ printf("%s\\n%s\\n", copyinstr(arg0), copyinstr(arg1)); }',
      '-c',
      format('node -r ts-node/register %s/fewer-args-json_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.falsy(exit_code, 'dtrace exited cleanly')
      t.is(traces[0], '{"foo":1}')
      t.is(traces[1], 'undefined')
    },
  ),
)
