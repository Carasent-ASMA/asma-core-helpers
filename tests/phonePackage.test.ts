import assert from 'node:assert/strict'
import { test } from 'node:test'

test('imports the built phone subpath without browser globals', async () => {
    assert.equal('window' in globalThis, false)

    const { parsePhoneNr, toE164 } = await import('asma-core-helpers/phone')

    assert.equal(typeof parsePhoneNr, 'function')
    assert.equal(typeof toE164, 'function')
    assert.equal('window' in globalThis, false)
})

test('canonicalises from the built output, so backends and the backfill share one rule', async () => {
    const { parsePhoneNr } = await import('asma-core-helpers/phone')

    const canonical = parsePhoneNr('4745456565', 'NO')
    assert.equal(canonical.ok, true)
    assert.equal(canonical.ok && canonical.e164, '+4745456565')

    assert.equal(parsePhoneNr('12345', 'NO').ok, false)
})
