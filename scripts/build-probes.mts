#!/usr/bin/env node
/**
 * build-probes.mts
 *
 * Development watch model:
 *  - Track addProbe() signatures per file (Map<file, Array<signature>>)
 *  - Flatten -> sorted unique global signature list; hash it.
 *  - On file add/change/unlink recompute that file's signatures only; diff global list.
 *  - If hash changes, regenerate manifest (by invoking emit-manifest.mts with --rescan) and rebuild native addon.
 *  - Log added / removed signatures for clarity.
 * Production (no --watch): just invoke emit-manifest.mts then native build.
 */
import { spawnSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const args = process.argv.slice(2)
const WATCH = args.includes('--watch')
const FORCE = args.includes('--force')
const DEBUG = process.env.DTRACE_DEBUG_WATCH === '1'

const manifestScript = new URL('./emit-manifest.mts', import.meta.url).pathname
const manifestPath = process.env.DTRACE_MANIFEST || 'probes.manifest.json'

type Signature = { probe: string; args: string[] }

function run(cmd: string, args: string[], opts: any = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status || 1)
}

function sha256(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

// --- Signature extraction ---
const typeRe = /['"`]([^'"`]+)['"`]/g
const ALLOWED = new Set(['int', 'uint', 'char *', 'char*', 'string', 'double', 'json'])
const ADD_PROBE_RE = /\.addProbe\s*\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*((?:,\s*['"`][^'"`]+['"`])*)\)/g

function parseTypes(rawList: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = typeRe.exec(rawList))) {
    let t = m[1]
    if (t === 'char*') t = 'char *'
    if (ALLOWED.has(t)) out.push(t)
  }
  return out
}

function extractFileSignatures(content: string): Signature[] {
  const sigs: Signature[] = []
  let m: RegExpExecArray | null
  while ((m = ADD_PROBE_RE.exec(content))) {
    sigs.push({ probe: m[2], args: parseTypes(m[3] || '') })
  }
  return sigs
}

// --- Global state (watch mode) ---
const fileSigs = new Map<string, Signature[]>()
let globalHash = ''
const SNAPSHOT_PATH = '.dtrace-signatures.json'

function computeGlobal(): { list: string[]; hash: string } {
  const flat: string[] = []
  for (const sigs of fileSigs.values()) {
    for (const s of sigs) flat.push(`${s.probe}|${s.args.join(',')}`)
  }
  flat.sort()
  const uniq: string[] = []
  for (const f of flat) if (uniq[uniq.length - 1] !== f) uniq.push(f)
  const hash = sha256(JSON.stringify(uniq))
  return { list: uniq, hash }
}

function logDiff(oldList: string[], newList: string[]) {
  const oldSet = new Set(oldList)
  const newSet = new Set(newList)
  const added: string[] = []
  const removed: string[] = []
  for (const n of newList) if (!oldSet.has(n)) added.push(n)
  for (const o of oldList) if (!newSet.has(o)) removed.push(o)
  if (added.length || removed.length) {
    const parts: string[] = []
    if (added.length) parts.push(`+${added.length}`)
    if (removed.length) parts.push(`-${removed.length}`)
    console.log(`[dtrace-provider] signature delta (${parts.join(' ')}):`)
    if (added.length) console.log('  added:', added.join(', '))
    if (removed.length) console.log('  removed:', removed.join(', '))
  }
}

let building = false
let rebuildQueued = false
function regenManifestAndBuild() {
  if (building) {
    rebuildQueued = true
    return
  }
  building = true
  run('node', [manifestScript, '--rescan'])
  if (!fs.existsSync(manifestPath)) {
    console.error('[dtrace-provider] manifest generation failed')
    process.exit(1)
  }
  const child = spawn('pnpm', ['build'], { stdio: 'inherit' })
  child.on('close', (code) => {
    if (code !== 0) process.exit(code || 1)
    const manifestContent = fs.readFileSync(manifestPath, 'utf8')
    const manifestHash = sha256(manifestContent)
    fs.writeFileSync(`${manifestPath}.sha256`, manifestHash + '\n')
    for (const f of fs.readdirSync('.'))
      if (f.endsWith('.node')) fs.writeFileSync(`${f}.probes.sha256`, manifestHash + '\n')
    console.log(`[dtrace-provider] native rebuilt (manifest hash ${manifestHash})`)
    building = false
    if (rebuildQueued) {
      rebuildQueued = false
      regenManifestAndBuild()
    }
  })
}

function initialScan() {
  const roots = ['oldtests', 'tests']
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(js|ts)$/.test(entry.name)) {
          try {
            fileSigs.set(full, extractFileSignatures(fs.readFileSync(full, 'utf8')))
          } catch {}
        }
      }
    }
    walk(root)
  }
  const { list, hash } = computeGlobal()
  let previous: string[] = []
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      previous = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'))
    } catch {}
  }
  globalHash = hash
  console.log(`[dtrace-provider] initial signatures (${list.length}):`)
  if (list.length) console.log('  ' + list.join('\n  '))
  if (DEBUG) console.log('[dtrace-provider][debug] initial hash: ' + hash)
  if (previous.length && sha256(JSON.stringify(previous)) !== hash) {
    console.log('[dtrace-provider] diff vs previous run:')
    logDiff(previous, list)
  }
  regenManifestAndBuild()
}

function updateFile(file: string) {
  if (!fs.existsSync(file)) fileSigs.delete(file)
  else {
    try {
      fileSigs.set(file, extractFileSignatures(fs.readFileSync(file, 'utf8')))
    } catch {
      return
    }
  }
}

function recomputeAndMaybeBuild(oldList: string[], reasonFile?: string) {
  const { list, hash } = computeGlobal()
  if (hash === globalHash && !FORCE) {
    console.log(`[dtrace-provider] no semantic probe change (skip rebuild)${reasonFile ? ' [' + reasonFile + ']' : ''}`)
    return
  }
  logDiff(oldList, list)
  globalHash = hash
  regenManifestAndBuild()
  // Persist snapshot for cross-restart diffing
  try {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(list, null, 2) + '\n')
  } catch {}
}

if (!WATCH) {
  run('node', [manifestScript, '--rescan'])
  regenManifestAndBuild()
} else {
  const { default: chokidar } = await import('chokidar')
  console.log('[dtrace-provider] watch mode (signature diff) enabled')
  // Start watcher BEFORE initial build so edits during build are not missed.
  const watchGlobs = ['oldtests/*.js', 'oldtests/**/*.js', 'tests/*.js', 'tests/**/*.js', 'tests/**/*.ts']
  if (DEBUG) console.log('[dtrace-provider][debug] watch globs:', watchGlobs)
  const watcher = chokidar.watch(watchGlobs, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 75, pollInterval: 25 },
  })
  if (DEBUG)
    watcher.on('raw', (event, pathRaw, details) => {
      console.log('[dtrace-provider][raw]', event, pathRaw, details ? JSON.stringify(details) : '')
    })
  let didInitial = false
  watcher.on('ready', () => {
    if (didInitial) return
    didInitial = true
    if (DEBUG) console.log('[dtrace-provider][debug] initial watcher ready')
    initialScan()
  })
  const onChange = (file: string, kind: string) => {
    if (DEBUG) console.log(`[dtrace-provider][debug] event: ${kind} ${file}${building ? ' (during build)' : ''}`)
    const oldList = computeGlobal().list
    const before = fileSigs.get(file) || []
    if (kind === 'unlink') fileSigs.delete(file)
    else updateFile(file)
    const after = fileSigs.get(file) || []
    if (DEBUG) {
      console.log(
        '[dtrace-provider][debug] file before sigs:',
        before.map((s) => s.probe + '|' + s.args.join(',')).join(',') || '(none)',
      )
      console.log(
        '[dtrace-provider][debug] file after sigs :',
        after.map((s) => s.probe + '|' + s.args.join(',')).join(',') || '(none)',
      )
    }
    if (kind !== 'unlink') {
      const beforeStr = before.map((s) => `${s.probe}|${s.args.join(',')}`).sort()
      const afterStr = after.map((s) => `${s.probe}|${s.args.join(',')}`).sort()
      if (JSON.stringify(beforeStr) !== JSON.stringify(afterStr)) {
        console.log(`[dtrace-provider] file signature change (${file}):`)
        logDiff(beforeStr, afterStr)
      } else if (!building) {
        console.log(`[dtrace-provider] file change (${file}) produced no addProbe signature delta`)
      }
    } else {
      console.log(`[dtrace-provider] file removed (${file})`)
    }
    recomputeAndMaybeBuild(oldList, file)
  }
  watcher.on('add', (p) => onChange(p, 'add'))
  watcher.on('change', (p) => onChange(p, 'change'))
  watcher.on('unlink', (p) => onChange(p, 'unlink'))

  // Synthesize events for atomic editor save sequences that only emit raw rename.
  const pendingRaw = new Map<string, NodeJS.Timeout>()
  watcher.on('raw', (event: string, rawPath: string) => {
    if (event !== 'rename') return
    if (!/\.(js|ts)$/.test(rawPath)) return
    // Determine possible candidate relative paths (chokidar raw sometimes omits parent dir)
    const candidates: string[] = []
    if (rawPath.includes(path.sep)) {
      candidates.push(rawPath)
    } else {
      for (const base of ['oldtests', 'tests']) {
        const p = path.join(base, rawPath)
        candidates.push(p)
      }
    }
    for (const candidate of candidates) {
      if (pendingRaw.has(candidate)) continue
      const attemptState = { tries: 0, max: 3 }
      const schedule = () => {
        const to = setTimeout(() => {
          attemptState.tries++
          const exists = fs.existsSync(candidate)
          if (!exists && attemptState.tries < attemptState.max) {
            schedule() // retry to allow atomic save to settle
            return
          }
          pendingRaw.delete(candidate)
          const kind = exists ? (fileSigs.has(candidate) ? 'change' : 'add') : 'unlink'
          if (DEBUG)
            console.log(
              `[dtrace-provider][debug] synthesized ${kind} after raw rename for ${candidate} (tries=${attemptState.tries})`,
            )
          onChange(candidate, kind)
        }, 140)
        pendingRaw.set(candidate, to)
      }
      schedule()
    }
  })
  process.on('SIGINT', () => {
    console.log('\n[dtrace-provider] watch stopping')
    watcher.close().then(() => process.exit(0))
  })
}
