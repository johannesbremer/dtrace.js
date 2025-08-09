#!/usr/bin/env node
// TypeScript wrapper for `napi build` to normalize args and play well with pnpm.
import { spawnSync } from 'node:child_process'

// Base arguments; allow caller (CI) to append e.g. --target x86_64-pc-windows-msvc
const baseArgs = ['build', '--platform', '--release', '--no-strip']
const extra = process.argv.slice(2)
const r = spawnSync('napi', [...baseArgs, ...extra], { stdio: 'inherit' })
if (r.status) process.exit(r.status)
