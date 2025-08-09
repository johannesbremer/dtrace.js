#!/usr/bin/env node
/**
 * emit-manifest.mts (manifest v1)
 *
 * In non-watch / production builds this is the single source of truth.
 * During development watch mode a higher-level watcher performs fine‑grained
 * per‑file diffing of addProbe() call sites. It still invokes this script to
 * materialize the canonical static manifest used by Rust codegen.
 *
 * Canonicalization strategy:
 *  - For each probe name choose the maximum arity seen (longest arg list)
 *  - Merge conflicting positions preferring a stable, safe super‑type heuristic
 *  - (Optional dev metadata like variants/signatures not written anymore to keep
 *    the on-disk manifest stable; watch diffing handles change sensitivity.)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import process from 'node:process'

const ALLOWED_TYPES = new Set(['int', 'uint', 'char *', 'char*', 'string', 'double', 'json'])
const DEFAULT_MANIFEST_PATH = process.env.DTRACE_MANIFEST || 'probes.manifest.json'
const FORCE_RESCAN = process.env.DTRACE_FORCE_RESCAN === '1' || process.argv.includes('--rescan')
// Normalize __dirname equivalent for robustness on Windows
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ProbeAgg {
  name: string
  arg_types: string[]
  variants: Set<string>
}

function scanAll(): ProbeAgg[] {
  const roots = ['oldtests', 'tests']
  const agg = new Map<string, ProbeAgg>()
  const parseTypes = (rawList: string): string[] => {
    const typeRe = /['"`]([^'"`]+)['"`]/g
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = typeRe.exec(rawList))) {
      let t = m[1]
      if (t === 'char*') t = 'char *'
      if (ALLOWED_TYPES.has(t)) out.push(t)
    }
    return out
  }
  const toKey = (args: string[]) => args.join('|')
  const add = (name: string, args: string[]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return
    const prev = agg.get(name)
    if (!prev) {
      agg.set(name, { name, arg_types: [...args], variants: new Set([toKey(args)]) })
      return
    }
    // record variant
    prev.variants.add(toKey(args))
    // choose canonical arg_types = max arity variant (first seen at that length) to remain compatible
    if (args.length > prev.arg_types.length) {
      prev.arg_types = [...args]
    } else if (args.length === prev.arg_types.length) {
      // keep existing canonical for stability (do not widen now that variants tracked)
    }
  }
  const staticRe = /\.addProbe\s*\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*((?:,\s*['"`][^'"`]+['"`])*)\)/g
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const f of fs.readdirSync(root)) {
      if (!/\.(js|ts)$/.test(f)) continue
      const p = path.join(root, f)
      let content: string
      try {
        content = fs.readFileSync(p, 'utf8')
      } catch {
        continue
      }
      let m: RegExpExecArray | null
      while ((m = staticRe.exec(content))) {
        add(m[2], parseTypes(m[3] || ''))
      }
      // Handle dynamic probe patterns like 'probe' + i in loops
      const loopRanges: Record<string, [number, number]> = {}
      const loopRe =
        /for\s*\(\s*(?:var|let|const)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+)\s*;[^;]*<\s*(\d+)\s*;[^)]*\+\+\s*\)/g
      let lm: RegExpExecArray | null
      while ((lm = loopRe.exec(content))) {
        const start = parseInt(lm[2], 10)
        const end = parseInt(lm[3], 10)
        if (end > start) loopRanges[lm[1]] = [start, end]
      }
      const dynRe =
        /\.addProbe\s*\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,\s*(['"`])([^'"`]+)\4)?\s*\)/g
      let dm: RegExpExecArray | null
      while ((dm = dynRe.exec(content))) {
        const prefix = dm[2]
        const varName = dm[3]
        const singleType = dm[5]
        const types = singleType ? parseTypes(',' + JSON.stringify(singleType)) : []
        if (loopRanges[varName]) {
          const [start, end] = loopRanges[varName]
          for (let i = start; i < end; i++) {
            add(prefix + i, types)
          }
        }
      }
    }
  }
  // legacy dynamic numeric probes (probeN) must have at least one int
  for (const p of agg.values()) {
    if (/^probe\d+$/.test(p.name) && p.arg_types.length === 0) p.arg_types.push('int')
  }
  return Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function canonicalize(probes: ProbeAgg[]): string {
  const obj = {
    schemaVersion: 1,
    provider: 'nodeapp',
    probes: probes.map((p) => ({
      name: p.name,
      arg_types: p.arg_types,
      variants: Array.from(p.variants.values())
        .map((v) => (v === '' ? [] : v.split('|')))
        .sort((a, b) => b.length - a.length || a.join(',').localeCompare(b.join(','))),
    })),
  }
  return JSON.stringify(obj, null, 2) + '\n'
}

function main() {
  let probes: ProbeAgg[] | undefined
  if (!FORCE_RESCAN && fs.existsSync(DEFAULT_MANIFEST_PATH)) {
    try {
      const j = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST_PATH, 'utf8'))
      if (j && Array.isArray(j.probes)) probes = j.probes
    } catch {}
  }
  if (!probes) probes = scanAll()
  const canonical = canonicalize(probes)
  const hash = crypto.createHash('sha256').update(canonical).digest('hex')
  fs.writeFileSync(DEFAULT_MANIFEST_PATH, canonical)
  process.stdout.write(JSON.stringify({ path: DEFAULT_MANIFEST_PATH, hash }) + '\n')
}

main()
