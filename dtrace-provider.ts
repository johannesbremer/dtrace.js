import {
  DTraceProvider as NativeDTraceProvider,
  DTraceProbe as NativeDTraceProbe,
  createDTraceProvider as nativeCreateDTraceProvider,
} from './index.js'

// Types for the old dtrace-provider API compatibility
interface LegacyDTraceProbe {
  // Old API: optional callback, followed by optional args passed to callback
  fire(callback?: (...cbArgs: any[]) => any[], ...cbArgs: any[]): void
}

interface LegacyDTraceProvider {
  addProbe(name: string, ...types: string[]): LegacyDTraceProbe
  enable(): void
  disable(): void
  fire(probeName: string, callback?: (...cbArgs: any[]) => any[], ...cbArgs: any[]): void
}

// Compatibility wrapper for the old dtrace-provider API
class DTraceProvider implements LegacyDTraceProvider {
  private _provider: InstanceType<typeof NativeDTraceProvider>
  private _probes: Map<string, LegacyDTraceProbe>

  constructor(name: string, module?: string) {
    this._provider = nativeCreateDTraceProvider(name, module)
    this._probes = new Map()
  }

  addProbe(name: string, ...types: string[]): LegacyDTraceProbe {
    // Convert individual arguments to array of strings
    const typeArray = types.map((t) => String(t))
    const probe = this._provider.addProbe(name, typeArray)

    // Create a wrapper probe with the old fire API
    const wrappedProbe: LegacyDTraceProbe = {
      fire: (callback?: (...cbArgs: any[]) => any[], ...cbArgs: any[]) => {
        if (typeof callback === 'function') {
          // Call the callback with user-provided args
          const args = callback(...cbArgs)
          if (Array.isArray(args)) {
            const stringArgs = args.map((arg) => {
              if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg)
              return String(arg)
            })
            probe.fireWithArgs(stringArgs)
            return
          }
        }
        // No callback or non-array result: fire with defaults
        probe.fire()
      },
    }

    this._probes.set(name, wrappedProbe)
    return wrappedProbe
  }

  fire(probeName: string, callback?: (...cbArgs: any[]) => any[], ...cbArgs: any[]): void {
    const probe = this._probes.get(probeName)
    if (probe) {
      probe.fire(callback as any, ...cbArgs)
      return
    }
    // Fall back to native provider
    if (typeof callback === 'function') {
      const args = callback(...cbArgs)
      if (Array.isArray(args)) {
        const stringArgs = args.map((arg) => {
          if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg)
          return String(arg)
        })
        this._provider.fireWithArgs(probeName, stringArgs)
        return
      }
    }
    this._provider.fire(probeName)
  }

  enable(): void {
    this._provider.enable()
  }

  disable(): void {
    this._provider.disable()
  }
}

export function createDTraceProvider(name: string, module?: string): LegacyDTraceProvider {
  return new DTraceProvider(name, module)
}

export { DTraceProvider }
export { NativeDTraceProbe as DTraceProbe }
