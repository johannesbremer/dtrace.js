// Manifest schema (v1) used both by build tooling and (optionally) user code.
// Keep in sync with emit-manifest.mjs validation & Rust build.rs deserialization.

export interface DTraceProbeManifestEntry {
  name: string
  arg_types: string[]
}

export interface DTraceProbesManifestV1 {
  schemaVersion: 1
  provider: string
  module?: string
  probes: DTraceProbeManifestEntry[]
}

export type AnyManifest = DTraceProbesManifestV1

export const ALLOWED_TYPES = ['int', 'uint', 'char *', 'char*', 'string', 'double', 'json'] as const
export type AllowedType = (typeof ALLOWED_TYPES)[number]

export function canonicalize(manifest: AnyManifest): string {
  const root: AnyManifest = {
    schemaVersion: manifest.schemaVersion,
    provider: manifest.provider,
    ...(manifest.module ? { module: manifest.module } : {}),
    probes: [...manifest.probes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ name: p.name, arg_types: [...p.arg_types] })),
  }
  return JSON.stringify(root, null, 2) + '\n'
}

export function validateManifest(m: AnyManifest): void {
  if (m.schemaVersion !== 1) throw new Error('schemaVersion must be 1')
  if (!m.provider) throw new Error('provider required')
  if (!Array.isArray(m.probes)) throw new Error('probes must be array')
  for (const [i, p] of m.probes.entries()) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name)) throw new Error(`probe[${i}].name invalid`)
    if (!Array.isArray(p.arg_types)) throw new Error(`probe[${i}].arg_types must be array`)
    for (const t of p.arg_types) {
      if (!ALLOWED_TYPES.includes(t as any)) throw new Error(`probe[${i}] invalid type ${t}`)
    }
  }
}
