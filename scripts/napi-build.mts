#!/usr/bin/env node
// TypeScript wrapper for `napi build` to normalize args and play well with pnpm.
import { spawnSync } from 'node:child_process'

const args = ['build', '--platform', '--release', '--no-strip']
const r = spawnSync('napi', args, { stdio: 'inherit' })
if (r.status) process.exit(r.status)
