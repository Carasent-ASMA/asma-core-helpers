import assert from 'node:assert/strict'
import { test } from 'node:test'

test('imports the built server subpath without browser globals', async () => {
    assert.equal('window' in globalThis, false)

    const { createTadaServerClient } = await import('asma-core-helpers/urql-server')

    assert.equal(typeof createTadaServerClient, 'function')
    assert.equal('window' in globalThis, false)
})
