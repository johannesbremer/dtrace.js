import {
  DTraceProvider as NativeDTraceProvider,
  DTraceProbe as NativeDTraceProbe,
  createDTraceProvider as nativeCreateDTraceProvider,
} from './index.js'

// Types for the old dtrace-provider API compatibility
interface LegacyDTraceProbe {
  fire(callback?: (probe: LegacyDTraceProbe) => any[]): void
}

interface LegacyDTraceProvider {
  addProbe(name: string, ...types: string[]): LegacyDTraceProbe
  enable(): void
  disable(): void
  fire(probeName: string, callback?: (probe: LegacyDTraceProbe) => any[]): void
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
      fire: (callback?: (probe: LegacyDTraceProbe) => any[]) => {
        if (typeof callback === 'function') {
          // Call the callback to get the arguments
          const args = callback(wrappedProbe)
          if (Array.isArray(args)) {
            // Convert arguments to strings
            const stringArgs = args.map((arg) => String(arg))
            probe.fireWithArgs(stringArgs)
          } else {
            probe.fire()
          }
        } else {
          probe.fire()
        }
      },
    }

    this._probes.set(name, wrappedProbe)
    return wrappedProbe
  }

  fire(probeName: string, callback?: (probe: LegacyDTraceProbe) => any[]): void {
    const probe = this._probes.get(probeName)
    if (probe) {
      probe.fire(callback)
    } else {
      // If probe doesn't exist, call the native provider fire method
      if (typeof callback === 'function') {
        const args = callback(probe as any)
        if (Array.isArray(args)) {
          const stringArgs = args.map((arg) => String(arg))
          this._provider.fireWithArgs(probeName, stringArgs)
        } else {
          this._provider.fire(probeName)
        }
      } else {
        this._provider.fire(probeName)
      }
    }
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
