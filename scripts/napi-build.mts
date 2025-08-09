#!/usr/bin/env node
// TypeScript wrapper for `napi build` to normalize args, ignore pnpm noise, ensure artifact at repo root.
import { spawnSync } from 'node:child_process'

const DISALLOWED = new Set(['--silent'])
const userArgsRaw = process.argv.slice(2)
const userArgs = userArgsRaw.filter((a) => !DISALLOWED.has(a))
// Determine if user already provided output dir
let hasOutputDir = false
for (let i = 0; i < userArgs.length; i++) {
  if (userArgs[i] === '--output-dir' || userArgs[i] === '-o') {
    hasOutputDir = true
    break
  }
  if (userArgs[i].startsWith('--output-dir=')) {
    hasOutputDir = true
    break
  }
}
const baseArgs = ['build', '--platform', '--release', '--no-strip']
if (!hasOutputDir) baseArgs.push('--output-dir', '.')
// Ensure JS package name is correct (prevents default template name artifacts on Windows)
const hasJsName = userArgs.some((a) => a === '--js-package-name' || a.startsWith('--js-package-name='))
if (process.platform === 'win32' && !hasJsName) {
  baseArgs.push('--js-package-name', 'dtrace-provider')
}
const finalArgs = [...baseArgs, ...userArgs]
const r = spawnSync('napi', finalArgs, { stdio: 'inherit' })
if (r.status) process.exit(r.status)
