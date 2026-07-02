import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { getDefaultAppVersions, getInjectedPlatform } from './getDefaultAppVersions.ts'

const globalWithWindow = globalThis as { window?: unknown }

afterEach(() => {
    delete globalWithWindow.window
})

describe('getInjectedPlatform', () => {
    it('returns undefined when there is no window (node/SSR)', () => {
        assert.equal(getInjectedPlatform(), undefined)
    })

    it('reads window.__ASMA_PLATFORM__', () => {
        globalWithWindow.window = { __ASMA_PLATFORM__: { default_app_versions: { 'asma-app-shell': '0.75.5' } } }
        assert.deepEqual(getInjectedPlatform()?.default_app_versions, { 'asma-app-shell': '0.75.5' })
    })

    it('prefers window.rawWindow when present (qiankun child app)', () => {
        globalWithWindow.window = {
            rawWindow: { __ASMA_PLATFORM__: { default_app_versions: { 'asma-app-calendar': '1.2.3' } } },
        }
        assert.deepEqual(getInjectedPlatform()?.default_app_versions, { 'asma-app-calendar': '1.2.3' })
    })
})

describe('getDefaultAppVersions', () => {
    it('prefers the injected map over the fallback (first-hit wins)', () => {
        globalWithWindow.window = { __ASMA_PLATFORM__: { default_app_versions: { a: '1.0.0' } } }
        assert.deepEqual(getDefaultAppVersions({ a: '0.0.1' }), { a: '1.0.0' })
    })

    it('falls back to the auth-response value when nothing is injected', () => {
        assert.deepEqual(getDefaultAppVersions({ a: '0.0.1' }), { a: '0.0.1' })
    })

    it('falls back when the injected map is empty (treated as absent)', () => {
        globalWithWindow.window = { __ASMA_PLATFORM__: { default_app_versions: {} } }
        assert.deepEqual(getDefaultAppVersions({ a: '0.0.1' }), { a: '0.0.1' })
    })

    it('returns undefined when neither injected nor fallback is present', () => {
        assert.equal(getDefaultAppVersions(), undefined)
    })
})
