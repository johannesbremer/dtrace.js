import { AnyManifest, DTraceProbesManifestV1, ALLOWED_TYPES, AllowedType } from './manifest'

export class ProbesBuilder {
  private provider: string
  private module?: string
  private probes = new Map<string, string[]>()

  constructor(provider: string, module?: string) {
    this.provider = provider
    this.module = module
  }

  addProbe(name: string, ...arg_types: AllowedType[]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid probe name ${name}`)
    for (const t of arg_types) if (!ALLOWED_TYPES.includes(t)) throw new Error(`invalid type ${t}`)
    this.probes.set(name, [...arg_types])
    return this
  }

  toManifest(): AnyManifest {
    const manifest: DTraceProbesManifestV1 = {
      schemaVersion: 1,
      provider: this.provider,
      ...(this.module ? { module: this.module } : {}),
      probes: [...this.probes.entries()].map(([name, arg_types]) => ({ name, arg_types })),
    }
    return manifest
  }
}

export function createProbesBuilder(provider: string, module?: string) {
  return new ProbesBuilder(provider, module)
}
