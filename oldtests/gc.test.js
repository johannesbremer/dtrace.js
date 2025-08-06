require('ts-node/register')
/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('tap').test
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'check probe object is not GCd while provider exists',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::gcprobe{ printf("%d\\n", arg0); }',
      '-c',
      format('node --expose_gc %s/gc_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.notOk(exit_code, 'dtrace exited cleanly')
      t.equal(traces[0], '0')
    },
  ),
)
