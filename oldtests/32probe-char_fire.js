/*
This file is forked from the following 2-Clause BSD licensed repo:
https://github.com/chrisa/node-dtrace-provider/tree/e9d860eaf553b489bd897e15bd0153f38b8e73a8
*/
// see 32probe-char.test.js

var d = require('../dtrace-provider.ts')

var provider = d.createDTraceProvider('testlibusdt')
var probe = provider.addProbe(
  '32probe',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
  'char *',
)
provider.enable()

var letters = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
]

probe.fire(function (p) {
  return letters
})
