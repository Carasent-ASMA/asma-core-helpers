import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    errorWithHint,
    formatValidationMessage,
    getValidationMessage,
    getValidationMessages,
    validationMessages,
} from './messages.js'

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
        assert.equal(getValidationMessages('nb').required, 'Obligatorisk')
        assert.equal(getValidationMessages('en').required, 'Required')
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
            'Skriv inn en gyldig e-postadresse med domene. — name@carasent.com',
        )
    })
})

describe('Figma copy rules (ASMA-8073)', () => {
    it('every sentence ends with a period; Required is the one exception', () => {
        for (const locale of ['en', 'nb'] as const) {
            for (const [key, value] of Object.entries(validationMessages[locale])) {
                if (key === 'required') continue
                assert.ok(value.endsWith('.'), `${locale}.${key} must end with a period`)
            }
        }
    })

    it('no generic "Invalid …" / "Duplicate …" copy remains', () => {
        for (const value of Object.values(validationMessages.en)) {
            assert.doesNotMatch(value, /^(Invalid|Duplicate)\b/)
        }
    })

    it('EN and NB use the same placeholders', () => {
        const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
        for (const key of Object.keys(validationMessages.en) as (keyof typeof validationMessages.en)[]) {
            assert.equal(names(validationMessages.nb[key]), names(validationMessages.en[key]), key)
        }
    })
})

describe('formatValidationMessage', () => {
    it('fills placeholders', () => {
        assert.equal(getValidationMessage('en', 'max_length', { n: 100 }), 'Enter no more than 100 characters.')
        assert.equal(getValidationMessage('nb', 'length_between', { min: 36, max: 100 }), 'Skriv inn mellom 36 og 100 tegn.')
    })

    it('keeps unknown placeholders visible', () => {
        assert.equal(formatValidationMessage('Enter at least {n} characters.', {}), 'Enter at least {n} characters.')
        assert.equal(formatValidationMessage('Required'), 'Required')
    })
})
