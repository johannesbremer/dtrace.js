#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const manifestScript = new URL('./emit-manifest.mjs', import.meta.url).pathname
const manifestPath = process.env.DTRACE_MANIFEST || 'probes.manifest.json'

function sha256File(p) {
  const buf = fs.readFileSync(p)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) {
    process.exit(r.status || 1)
  }
}

// 1. Emit manifest (prints json with hash; we recompute from file for trust)
run('node', [manifestScript])
if (!fs.existsSync(manifestPath)) {
  console.error('[dtrace-provider] expected manifest not created')
  process.exit(1)
}
const manifestHash = sha256File(manifestPath)

// 2. Build native addon (always for now; could cache by hash & target triple later)
run('pnpm', ['build'])

// 3. Write sidecar hash next to broadest available binary (we do per-platform names) & a generic file
const sidecarName = `${path.basename(manifestPath)}.sha256`
fs.writeFileSync(sidecarName, manifestHash + '\n')

// Write a hash file next to each produced binary we shipped (scan root *.node)
for (const f of fs.readdirSync('.')) {
  if (f.endsWith('.node')) {
    fs.writeFileSync(`${f}.probes.sha256`, manifestHash + '\n')
  }
}
console.log(`[dtrace-provider] probes built with manifest hash ${manifestHash}`)
