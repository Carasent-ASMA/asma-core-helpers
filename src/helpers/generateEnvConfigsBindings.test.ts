import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

// realWindow / initEnvConfigsVars read window + localStorage at module-import time,
// so the globals must exist before the module under test is (dynamically) imported.
const globalWithWindow = globalThis as typeof globalThis & {
    window?: Record<string, unknown>
    localStorage?: Storage
}

let bindings: typeof import('./generateEnvConfigsBindings.ts')

before(async () => {
    globalWithWindow.window = {
        location: {
            origin: 'http://test.adopus.no',
            hostname: 'test.adopus.no',
            host: 'test.adopus.no',
        },
    }
    globalWithWindow.localStorage = {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
    } as unknown as Storage

    bindings = await import('./generateEnvConfigsBindings.ts')
})

after(() => {
    delete globalWithWindow.window
    delete globalWithWindow.localStorage
})

describe('generateEnvConfigsBindings (shared module instance)', () => {
    it('throws when nothing has been registered yet', () => {
        assert.throws(() => bindings.EnvConfigsFnInternal())
    })

    it("keeps every app's service resolvable after several apps register (no last-write-wins)", () => {
        // Host app first: requires SRV_PROXY (like asma-app-shell).
        bindings.generateEnvConfigsBindings(
            { envs: {} },
            ['SRV_AUTH', 'SRV_PROXY', 'DEVELOPMENT'],
            { CACHE_VERSION: '1.0.0' },
        )

        // Child app second, mounted later: does NOT require SRV_PROXY (like asma-app-calendar).
        bindings.generateEnvConfigsBindings(
            { envs: {} },
            ['SRV_AUTH', 'SRV_CALENDAR', 'DEVELOPMENT'],
            { CACHE_VERSION: '1.0.1' },
        )

        const config = bindings.EnvConfigsFnInternal()

        // SRV_PROXY must stay resolvable even though the last registration omitted it.
        assert.equal(config.SRV_PROXY, '/api/artifact')
        // Services only the child requires must be resolvable too.
        assert.equal(config.SRV_CALENDAR, '/api/calendar')
        // On overlapping keys the first registration wins (host app semantics).
        assert.equal(config.CACHE_VERSION, '1.0.0')
    })
})
