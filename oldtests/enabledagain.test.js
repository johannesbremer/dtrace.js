/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var test = require('ava')
var format = require('util').format
var dtest = require('./dtrace-test').dtraceTest

test(
  'provider enabled again',
  dtest(
    function () {},
    [
      'dtrace',
      '-Zqn',
      'nodeapp$target:::{ printf("%d %d\\n", epid, arg0); }',
      '-c',
      format('node -r ts-node/register %s/enabledagain_fire.js', __dirname),
    ],
    function (t, exit_code, traces) {
      t.falsy(exit_code, 'dtrace exited cleanly')
      t.is(traces.length, 2, 'got 2 traces')

      var i = 1
      var epid
      traces.forEach(function (trace) {
        cols = trace.split(' ')
        t.is([i].toString(), cols[1], 'traced value correct')
        if (epid) {
          t.is(epid, cols[0], 'same epid')
        } else {
          epid = cols[0]
        }
        i++
      })
    },
  ),
)
