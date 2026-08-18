import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { email, hasDigit, httpUrl, name, pattern, phoneNr, pnr, required } from './rules.js'

describe('required', () => {
    it('rejects empty, whitespace, null, undefined', () => {
        assert.equal(required(''), false)
        assert.equal(required('   '), false)
        assert.equal(required(null), false)
        assert.equal(required(undefined), false)
    })

    it('accepts non-empty strings and other values', () => {
        assert.equal(required('x'), true)
        assert.equal(required(0), true)
        assert.equal(required(false), true)
    })
})

describe('email', () => {
    it('MUT-004: email without @ must fail', () => {
        assert.equal(email('notanemail'), false)
        assert.equal(email('user.domain.com'), false)
        assert.equal(email('user@'), false)
    })

    it('accepts a normal address', () => {
        assert.equal(email('name@carasent.com'), true)
        assert.equal(email('a.b-c@example.co.uk'), true)
    })
})

describe('name', () => {
    it('requires a Unicode uppercase first letter', () => {
        assert.equal(name('John'), true)
        assert.equal(name('John Doe'), true)
        assert.equal(name('john'), false)
        assert.equal(name(''), false)
    })

    /**
     * Real names from the directory, supplied as the acceptance set. They are the specification:
     * a rule that rejects any of these is wrong however tidy it looks.
     */
    it('accepts the real names it has to accept', () => {
        for (const real of [
            'Bo Henki Steinsland-Tønnessen',
            'Bjørn Emil Gloppen Jørgensen',
            'Bjørge Øfstaas',
            'Kenneth Jul-Larsen',
            'Gun Jorunn Haughom Sørheim',
            'Lone Mjørnaren Darum Jr.',
            'Martine Mosengen Sr.',
            'Tommy André Pedersen',
            'Tuva Elisabeth Næs Andersen',
            'Willian Garthner II ',
            'Porsgrunn commune IKT',
        ]) {
            assert.equal(name(real), true, real)
        }
    })

    it('accepts both apostrophes — editors substitute the typographic one silently', () => {
        assert.equal(name("O'Brien"), true)
        assert.equal(name('O\u2019Brien'), true)
        assert.equal(name("Lars D'Angelo Næss"), true)
    })

    /** `\p{L}` already spans every script — Norwegian letters are not a special case. */
    it('treats Norwegian letters as ordinary letters', () => {
        assert.equal(name('Æse Ørn Ådne'), true)
        assert.equal(name('Øystein'), true)
    })

    /**
     * The asymmetry this removes: `Ivan123` passed while `123` failed, so the only message the
     * caller could show for `123` was "start with a capital letter".
     */
    it('rejects digits anywhere, not just as the first character', () => {
        assert.equal(name('Ivan123'), false)
        assert.equal(name('123'), false)
        assert.equal(name('Ivan 123'), false)
        assert.equal(name('Willian Garthner 2'), false)
    })

    it('rejects a lower-case opening and punctuation the set does not cover', () => {
        assert.equal(name('kenneth Jul-Larsen'), false)
        assert.equal(name('Lastname, Firstname'), false)
        assert.equal(name('Foo;Bar'), false)
    })
})

describe('hasDigit', () => {
    it('separates "there is a number in here" from every other name failure', () => {
        assert.equal(hasDigit('Ivan123'), true)
        assert.equal(hasDigit('123'), true)
        assert.equal(hasDigit('ivan'), false)
        assert.equal(hasDigit('Ann-Kristin'), false)
    })
})

describe('phoneNr', () => {
    it('matches the directory pilot regex', () => {
        assert.equal(phoneNr('+47123456'), true)
        assert.equal(phoneNr('123456'), true)
        assert.equal(phoneNr('12345'), false)
        assert.equal(phoneNr('abc'), false)
    })
})

describe('pattern', () => {
    it('delegates to the given regex', () => {
        assert.equal(pattern('abc', /^[a-z]+$/), true)
        assert.equal(pattern('123', /^[a-z]+$/), false)
    })
})

describe('pnr', () => {
    // Temporary FNR: valid date + 11111 suffix (no modulus check).
    const validTemporary = '01019011111'

    it('accepts a valid Norwegian personal number via getValidNorwegianPersonalNumber', () => {
        assert.equal(pnr(validTemporary), true)
    })

    it('rejects invalid values', () => {
        assert.equal(pnr(''), false)
        assert.equal(pnr('123'), false)
        assert.equal(pnr('00000000000'), false)
    })
})

describe('httpUrl', () => {
    it('accepts ordinary web addresses', () => {
        assert.equal(httpUrl('https://example.com'), true)
        assert.equal(httpUrl('http://example.com'), true)
        assert.equal(httpUrl('https://dok.adcuris.no/ad-voca/uO5TQY5Z2K271Ycumsj5'), true)
        assert.equal(httpUrl('  https://example.com  '), true)
    })

    /** The shapes the hand-rolled URL regex used to reject even though they are perfectly valid. */
    it('accepts ports, fragments, internationalised hosts and full path/query syntax', () => {
        assert.equal(httpUrl('https://example.com:8080'), true)
        assert.equal(httpUrl('https://example.com/page#section'), true)
        assert.equal(httpUrl('https://bxrum.no'.replace('x', '\u00e6')), true)
        assert.equal(httpUrl('https://example.com/a+b,c~d'), true)
        assert.equal(httpUrl('https://x.no/a?b=c&d=e'), true)
    })

    /** The shapes a bare `new URL()` check used to let through as a "web address". */
    it('rejects non-web schemes and scheme-less input', () => {
        assert.equal(httpUrl('mailto:a@b.c'), false)
        assert.equal(httpUrl('foo:bar'), false)
        assert.equal(httpUrl('javascript:alert(1)'), false)
        assert.equal(httpUrl('example.com'), false)
        assert.equal(httpUrl(''), false)
    })
})
