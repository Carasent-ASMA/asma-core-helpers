import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { phoneExample } from './phoneExample.js'

describe('phoneExample', () => {
    it('supplies the actionable half of a validation message (REQ-003)', () => {
        assert.equal(phoneExample('NO'), '+47 40 61 23 45')
        assert.equal(phoneExample('US'), '+1 201 555 0123')
    })

    it('always yields something to show, even without example metadata', () => {
        for (const iso2 of ['NO', 'US', 'GB', 'SE', 'AX', 'SJ'] as const) {
            assert.match(phoneExample(iso2), /^\+\d/)
        }
    })
})
