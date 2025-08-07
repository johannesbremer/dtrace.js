require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('tap').test
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'firing probe with too many arguments',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::p1{ printf("%d\\n%d\\n", arg0, arg1); }',
      '-c',
      format('node %s/more-args_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.notOk(exit_code, 'dtrace exited cleanly')
      t.equal(traces[0], '1')
      t.equal(traces[1], '2')
    },
  ),
)
