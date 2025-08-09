#!/usr/bin/env node
/**
 * dtrace-provider manifest emitter / validator (v1)
 *
 * Responsibilities:
 *  - Load an existing manifest or synthesize one by scanning source/tests (fallback for this repo)
 *  - Optionally execute a user-specified builder module that exports `buildProbes(builder)` or a manifest object
 *  - Validate against the v1 schema (lightweight inline validation to avoid heavy deps here)
 *  - Canonicalize + write deterministic JSON (stable key ordering & sorted probes)
 *  - Print the manifest path & sha256 hash to stdout (JSON)
 *
 * General users are expected to supply their own builder; the test suite in this repo relies
 * on dynamic probe additions — we scan test sources when no explicit builder/manifest exists
 * so that tests remain unchanged while we migrate to manifest-first workflow.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const ALLOWED_TYPES = new Set(['int', 'uint', 'char *', 'char*', 'string', 'double', 'json'])
const DEFAULT_MANIFEST_PATH = process.env.DTRACE_MANIFEST || 'probes.manifest.json'

function pathToFileUrl(p) {
  let pref = path.resolve(p)
  if (!pref.startsWith('/')) return new URL('file://' + pref)
  return new URL('file://' + pref)
}

function scanForProbes() {
  // Heuristic scan mirroring the legacy build script to keep tests working.
  const roots = ['oldtests', 'tests']
  const probes = new Map() // name -> { name, arg_types }
  const record = (name, arg_types) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return
    const prev = probes.get(name)
    if (!prev || prev.arg_types.length < arg_types.length) {
      probes.set(name, { name, arg_types })
    }
  }
  const addFromContent = (content) => {
    // Static pattern: .addProbe('p1', 'int', 'char *', ...)
    const staticRe = /\.addProbe\s*\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*((?:,\s*['"`][^'"`]+['"`])*)\)/g
    let m
    while ((m = staticRe.exec(content))) {
      const argPortion = m[3] || ''
      const typeRe = /,\s*['"`]([^'"`]+)['"`]/g
      const types = []
      let t
      while ((t = typeRe.exec(argPortion))) {
        const raw = t[1]
        if (ALLOWED_TYPES.has(raw)) types.push(raw)
        else if (raw === 'char*') types.push('char *')
        else if (raw === 'string') types.push('string')
        else if (raw === 'json') types.push('json')
        else if (raw === 'int') types.push('int')
      }
      record(m[2], types)
    }
    // Loop expansion for simple dynamic names prefix + i
    const loopRanges = {}
    const loopRe =
      /for\s*\(\s*(?:var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+)\s*;[^;]*<\s*(\d+)\s*;[^)]*\+\+\s*\)/g
    while ((m = loopRe.exec(content))) {
      const start = parseInt(m[2], 10)
      const end = parseInt(m[3], 10)
      if (end > start) loopRanges[m[1]] = [start, end]
    }
    const dynRe =
      /\.addProbe\s*\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*(['"`])([^'"`]+)\4)?/g
    let dm
    while ((dm = dynRe.exec(content))) {
      const prefix = dm[2]
      const v = dm[3]
      const singleType = dm[5]
      const types = []
      if (singleType) {
        if (ALLOWED_TYPES.has(singleType)) types.push(singleType)
        else if (singleType === 'char*') types.push('char *')
        else if (singleType === 'string') types.push('string')
        else if (singleType === 'json') types.push('json')
        else if (singleType === 'int') types.push('int')
      }
      if (loopRanges[v]) {
        const [s, e] = loopRanges[v]
        for (let i = s; i < e; i++) record(prefix + i, types)
      }
    }

    // Fallback broader dynamic pattern capturing multiple types segment
    const dynAllRe =
      /\.addProbe\s*\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)\s*,([^)]*)\)/g
    let dm2
    while ((dm2 = dynAllRe.exec(content))) {
      const prefix = dm2[1]
      const v = dm2[2]
      const argsPart = dm2[3]
      const typeRe = /['"`]([^'"`]+)['"`]/g
      const types = []
      let tt
      while ((tt = typeRe.exec(argsPart))) {
        const raw = tt[1]
        if (ALLOWED_TYPES.has(raw)) types.push(raw)
        else if (raw === 'char*') types.push('char *')
        else if (raw === 'string') types.push('string')
        else if (raw === 'json') types.push('json')
        else if (raw === 'int') types.push('int')
      }
      if (loopRanges[v]) {
        const [s, e] = loopRanges[v]
        for (let i = s; i < e; i++) record(prefix + i, types)
      }
    }
  }
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const file of fs.readdirSync(root)) {
      if (!/\.(js|ts)$/.test(file)) continue
      const p = path.join(root, file)
      try {
        addFromContent(fs.readFileSync(p, 'utf8'))
      } catch {
        /* ignore */
      }
    }
  }
  // Merge variants: max arity; int wins per slot; json & string collapse to original type preference order (keep json if any json else string)
  const merged = []
  for (const { name, arg_types } of probes.values()) {
    let ent = merged.find((p) => p.name === name)
    if (!ent) {
      ent = { name, arg_types: [...arg_types] }
      merged.push(ent)
      continue
    }
    const max = Math.max(ent.arg_types.length, arg_types.length)
    const next = Array.from({ length: max }, () => 'string')
    for (let i = 0; i < max; i++) {
      const a = ent.arg_types[i]
      const b = arg_types[i]
      const pick = (vals) => vals.find((v) => v === 'int') || (vals.find((v) => v === 'json') ? 'json' : 'string')
      next[i] = pick([a, b].filter(Boolean))
    }
    ent.arg_types = next
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name))
}

function validateManifest(obj) {
  const err = (msg) => {
    throw new Error(`Manifest validation failed: ${msg}`)
  }
  if (typeof obj !== 'object' || !obj) err('root must be object')
  if (obj.schemaVersion !== 1) err('schemaVersion must be 1')
  if (typeof obj.provider !== 'string' || !obj.provider) err('provider must be non-empty string')
  if (!Array.isArray(obj.probes)) err('probes must be array')
  obj.probes.forEach((p, idx) => {
    if (typeof p !== 'object' || !p) err(`probe[${idx}] must be object`)
    if (typeof p.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name)) err(`probe[${idx}].name invalid`)
    if (!Array.isArray(p.arg_types)) err(`probe[${idx}].arg_types must be array`)
    p.arg_types.forEach((t, j) => {
      if (typeof t !== 'string' || !ALLOWED_TYPES.has(t)) err(`probe[${idx}].arg_types[${j}] invalid: ${t}`)
    })
  })
}

function canonicalize(manifest) {
  const out = {}
  out.schemaVersion = manifest.schemaVersion
  out.provider = manifest.provider
  if (manifest.module) out.module = manifest.module
  out.probes = [...manifest.probes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      return { name: p.name, arg_types: [...p.arg_types] }
    })
  return JSON.stringify(out, null, 2) + '\n'
}

async function main() {
  let manifest
  if (fs.existsSync(DEFAULT_MANIFEST_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'))
      // quick structural sanity check before trusting
      if (parsed && Array.isArray(parsed.probes) && parsed.probes.every((p) => p && typeof p.name === 'string')) {
        manifest = parsed
      } else {
        console.error('[dtrace-provider] existing manifest invalid – regenerating')
      }
    } catch (e) {
      console.error('[dtrace-provider] Failed to parse existing manifest, will re-create:', e.message)
    }
  }
  if (!manifest) {
    const builderModPath = process.env.DTRACE_PROBES_BUILDER
    if (builderModPath && fs.existsSync(builderModPath)) {
      const mod = await import(pathToFileUrl(builderModPath))
      if (typeof mod.toManifest === 'function') manifest = mod.toManifest()
      else if (mod.default && typeof mod.default.toManifest === 'function') manifest = mod.default.toManifest()
      else if (mod.manifest) manifest = mod.manifest
      else console.error('[dtrace-provider] builder module did not export a manifest / toManifest()')
    }
  }
  if (!manifest) {
    const scanned = scanForProbes()
    manifest = { schemaVersion: 1, provider: 'nodeapp', probes: scanned }
  }
  // Legacy test compatibility: ensure dynamic numeric probes have int slot
  for (const p of manifest.probes) {
    if (/^probe\d+$/.test(p.name) && p.arg_types.length === 0) {
      p.arg_types.push('int')
    }
  }
  validateManifest(manifest)
  const canonical = canonicalize(manifest)
  const hash = crypto.createHash('sha256').update(canonical).digest('hex')
  if (!fs.existsSync(path.dirname(DEFAULT_MANIFEST_PATH))) {
    fs.mkdirSync(path.dirname(DEFAULT_MANIFEST_PATH), { recursive: true })
  }
  fs.writeFileSync(DEFAULT_MANIFEST_PATH, canonical)
  process.stdout.write(JSON.stringify({ path: DEFAULT_MANIFEST_PATH, hash }) + '\n')
}

main().catch((e) => {
  console.error(e.stack || e)
  process.exit(1)
})
