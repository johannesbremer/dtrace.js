/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
var spawn = require('child_process').spawn

exports.dtraceTest = function (setup, dtargv, test) {
  return function (t) {
    return new Promise((resolve, reject) => {
      setup()

      var dtrace = spawn('/usr/sbin/dtrace', dtargv.slice(1))

      var traces = []
      var exit_code
      dtrace.stdout.on('data', function (data) {
        //console.error("DTRACE STDOUT:", data.toString());
        traces.push(data.toString())
      })
      dtrace.stderr.on('data', function (data) {
        //console.error("DTRACE STDERR:", data.toString());
      })
      dtrace.on('exit', function (code) {
        exit_code = code
      })
      dtrace.on('close', function () {
        traces = traces
          .join('')
          .split('\n')
          .filter(function (t) {
            return t.trim().length
          })

        try {
          // Compatibility shim: support legacy assertions like t.not.is
          const tshim = Object.create(t)
          if (!tshim.not || typeof tshim.not.is !== 'function') {
            tshim.not = {
              is: (actual, expected, message) => t.not(actual, expected, message),
            }
          }
          test(tshim, exit_code, traces)
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}
