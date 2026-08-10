import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { errorWithHint, getValidationMessages, validationMessages } from './messages.js'

describe('validationMessages catalog', () => {
    it('exposes distinct NB and EN strings for every key', () => {
        const keys = Object.keys(validationMessages.en) as (keyof typeof validationMessages.en)[]
        assert.ok(keys.length > 0)
        for (const key of keys) {
            assert.notEqual(
                validationMessages.nb[key],
                validationMessages.en[key],
                `${key} must differ between nb and en`,
            )
        }
    })

    it('MUT-004: wrong language must fail — nb required is not the en string', () => {
        assert.notEqual(validationMessages.nb.required, validationMessages.en.required)
        assert.equal(getValidationMessages('nb').required, 'Dette feltet er obligatorisk')
        assert.equal(getValidationMessages('en').required, 'This field is required')
        assert.notEqual(getValidationMessages('nb').invalid_email, getValidationMessages('en').invalid_email)
    })

    it('getValidationMessages applies shallow overrides', () => {
        const msgs = getValidationMessages('en', { invalid_email: 'App override' })
        assert.equal(msgs.invalid_email, 'App override')
        assert.equal(msgs.required, validationMessages.en.required)
    })
})

describe('errorWithHint', () => {
    it('composes actionable "what — how to fix" (REQ-003)', () => {
        assert.equal(errorWithHint('Invalid email', 'name@carasent.com'), 'Invalid email — name@carasent.com')
        assert.equal(
            errorWithHint(validationMessages.nb.invalid_email, 'name@carasent.com'),
            'Ugyldig epost — name@carasent.com',
        )
    })
})
