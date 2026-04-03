import { setDefaultResultOrder } from 'node:dns'

function disableBrowserStorageGlobals(): void {
  const globalObject = globalThis as Record<string, unknown>

  for (const key of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)

    if (descriptor?.configurable ?? true) {
      Object.defineProperty(globalThis, key, {
        value: undefined,
        configurable: true,
        writable: true
      })
      continue
    }

    try {
      globalObject[key] = undefined
    } catch {
      // Ignore if the runtime does not allow overriding the property.
    }
  }
}

function preferIpv4DnsResolution(): void {
  try {
    setDefaultResultOrder('ipv4first')
  } catch {
    // Older or restricted runtimes may not allow changing DNS result order.
  }
}

disableBrowserStorageGlobals()
preferIpv4DnsResolution()
