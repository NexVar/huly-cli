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

disableBrowserStorageGlobals()
