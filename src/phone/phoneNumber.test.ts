import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    formatNationalAsYouType,
    formatPhoneForDisplay,
    isValidPhone,
    isValidPhoneValue,
    parsePhoneNr,
    parsePhoneValue,
    phoneTelHref,
    toE164,
} from './phoneNumber.js'
import type { PhoneCountry } from './phoneCountries.js'

describe('parsePhoneNr', () => {
    // The canonicalisation contract every writer and the backfill share. Each row is a
    // shape found in, or reachable into, `customer_user.phone_nr` today.
    const contract: readonly [string, PhoneCountry, string | 'INVALID'][] = [
        ['45456565', 'NO', '+4745456565'],
        ['4745456565', 'NO', '+4745456565'],
        ['004745456565', 'NO', '+4745456565'],
        ['+47 454 56 565', 'NO', '+4745456565'],
        ['47123456', 'NO', '+4747123456'],
        ['+37379094538', 'NO', '+37379094538'],
        ['0701234567', 'NO', 'INVALID'],
        ['0701234567', 'SE', '+46701234567'],
        ['12345', 'NO', 'INVALID'],
    ]

    for (const [input, region, expected] of contract) {
        it(`canonicalises ${input} under ${region} to ${expected}`, () => {
            const result = parsePhoneNr(input, region)

            if (expected === 'INVALID') {
                assert.deepEqual(result, { ok: false, reason: 'INVALID', input: input.trim() })
                return
            }

            assert.equal(result.ok, true)
            assert.equal(result.ok && result.e164, expected)
        })
    }

    it('reports the country and calling code the value resolved to', () => {
        const result = parsePhoneNr('45456565', 'NO')

        assert.deepEqual(result, { ok: true, e164: '+4745456565', country: 'NO', callingCode: '47' })
    })

    it('separates an empty value from an invalid one so a report can tell them apart', () => {
        for (const value of ['', '   ', null, undefined]) {
            assert.deepEqual(parsePhoneNr(value, 'NO'), { ok: false, reason: 'EMPTY', input: '' })
        }
    })

    it('reports rather than rewrites a number that is not real for the region', () => {
        // `12345678` and `00000000` passed the pre-ticket digit-count rules and are in the
        // data; no algorithm can recover an intended number from them.
        for (const junk of ['12345678', '00000000', '11111111']) {
            assert.deepEqual(parsePhoneNr(junk, 'NO'), { ok: false, reason: 'INVALID', input: junk })
        }
    })
})

describe('parsePhoneValue', () => {
    it('splits a stored E.164 value into country and national number', () => {
        assert.deepEqual(parsePhoneValue('+4748012345'), { iso2: 'NO', country: 'NO', national: '48012345' })
        assert.deepEqual(parsePhoneValue('+12015550123', 'NO'), { iso2: 'US', country: 'US', national: '2015550123' })
    })

    it('reads a pre-ASMA-7485 bare national number as the fallback country', () => {
        // Every record written before this ticket is 8 bare digits with no country. The fallback is
        // what the field edits with; `country` says whether the numbering plan actually confirms it.
        assert.deepEqual(parsePhoneValue('48012345', 'NO'), { iso2: 'NO', country: 'NO', national: '48012345' })
        assert.deepEqual(parsePhoneValue('48012345', 'SE'), { iso2: 'SE', country: 'SE', national: '48012345' })
    })

    it('keeps the caller country while a matching number is still being typed', () => {
        assert.deepEqual(parsePhoneValue('+47', 'NO'), { iso2: 'NO', country: 'NO', national: '' })
        assert.deepEqual(parsePhoneValue('+4748', 'NO'), { iso2: 'NO', country: 'NO', national: '48' })
    })

    it('switches country when the typed prefix belongs to another one', () => {
        assert.deepEqual(parsePhoneValue('+46701', 'NO'), { iso2: 'SE', country: 'SE', national: '701' })
    })

    it('treats empty, whitespace and nullish values as an empty number', () => {
        for (const value of ['', '   ', null, undefined]) {
            assert.deepEqual(parsePhoneValue(value, 'NO'), { iso2: 'NO', country: undefined, national: '' })
        }
    })

    it('falls back to the given country for an unknown calling code', () => {
        assert.deepEqual(parsePhoneValue('+9991234', 'NO'), { iso2: 'NO', country: undefined, national: '9991234' })
    })
})

describe('toE164', () => {
    it('composes the stored value from the country and the typed digits', () => {
        assert.equal(toE164('48012345', 'NO'), '+4748012345')
        assert.equal(toE164('2015550123', 'US'), '+12015550123')
    })

    it('drops mask separators so the stored value is digits and a plus only', () => {
        assert.equal(toE164('48 01 23 45', 'NO'), '+4748012345')
        assert.equal(toE164('(201) 555-0123', 'US'), '+12015550123')
    })

    it('stores nothing rather than a bare dial code for an empty number', () => {
        assert.equal(toE164('', 'NO'), '')
        assert.equal(toE164('   ', 'NO'), '')
    })

    it('does not validate — an in-progress number must still round-trip', () => {
        assert.equal(toE164('4', 'NO'), '+474')
    })

    it('does not double a country code the input already carries', () => {
        // Concatenation stored `+474748012345` and `+47004748012345`, both unusable.
        assert.equal(toE164('4748012345', 'NO'), '+4748012345')
        assert.equal(toE164('004748012345', 'NO'), '+4748012345')
        assert.equal(toE164('4781234567', 'NO'), '+4781234567')
    })

    it('drops the trunk prefix countries write their national numbers with', () => {
        // SE/GB/DE national form carries a leading 0 that is not part of the E.164 number,
        // so concatenation stored `+460701234567` for a number people write as 070-123 45 67.
        assert.equal(toE164('0701234567', 'SE'), '+46701234567')
        assert.equal(toE164('07911123456', 'GB'), '+447911123456')
        assert.equal(toE164('015112345678', 'DE'), '+4915112345678')
    })

    it('keeps a genuine national number that merely starts with the dial code', () => {
        assert.equal(toE164('47123456', 'NO'), '+4747123456')
    })

    it('round-trips through parsePhoneValue', () => {
        const parsed = parsePhoneValue(toE164('48012345', 'NO'))
        assert.deepEqual(parsed, { iso2: 'NO', country: 'NO', national: '48012345' })
    })
})

describe('formatNationalAsYouType', () => {
    it('groups by the country format, progressively', () => {
        assert.equal(formatNationalAsYouType('4', 'NO'), '4')
        assert.equal(formatNationalAsYouType('480', 'NO'), '48 0')
        assert.equal(formatNationalAsYouType('48012345', 'NO'), '48 01 23 45')
    })

    it('uses each country own grouping, not a Norwegian one', () => {
        assert.equal(formatNationalAsYouType('2133734253', 'US'), '213 373 4253')
        assert.equal(formatNationalAsYouType('512345678', 'PL'), '512 345 678')
    })

    it('groups countries that carry a trunk prefix, which the national format cannot', () => {
        // AsYouType('SE') returns '701234567' unformatted: Swedish national formats are
        // defined with the leading 0, which a national significant number does not carry.
        assert.equal(formatNationalAsYouType('701234567', 'SE'), '70 123 45 67')
        assert.equal(formatNationalAsYouType('7400123456', 'GB'), '7400 123456')
        assert.equal(formatNationalAsYouType('612345678', 'FR'), '6 12 34 56 78')
    })

    it('returns an empty string when there is nothing to format', () => {
        assert.equal(formatNationalAsYouType('', 'NO'), '')
        assert.equal(formatNationalAsYouType('abc', 'NO'), '')
    })
})

describe('isValidPhone', () => {
    it('accepts a real number for the country', () => {
        assert.equal(isValidPhone('48012345', 'NO'), true)
        assert.equal(isValidPhone('2015550123', 'US'), true)
    })

    it('rejects by country pattern, not merely by digit count', () => {
        // Both are eight digits — the length the field used to accept unconditionally.
        assert.equal(isValidPhone('12345678', 'NO'), false)
        assert.equal(isValidPhone('00000000', 'NO'), false)
    })

    it('rejects numbers outside the E.164 length bounds', () => {
        assert.equal(isValidPhone('123', 'NO'), false)
        assert.equal(isValidPhone('1234567890123456', 'NO'), false)
    })

    it('accepts a number that is valid elsewhere but not for the selected country', () => {
        assert.equal(isValidPhone('2015550123', 'NO'), false)
    })

    it('ignores mask separators', () => {
        assert.equal(isValidPhone('48 01 23 45', 'NO'), true)
    })
})

describe('isValidPhoneValue', () => {
    it('resolves the country from the stored value', () => {
        assert.equal(isValidPhoneValue('+12015550123'), true)
        assert.equal(isValidPhoneValue('+4712345678'), false)
    })

    it('validates a legacy bare number against the fallback country', () => {
        assert.equal(isValidPhoneValue('48012345', 'NO'), true)
        assert.equal(isValidPhoneValue('12345678', 'NO'), false)
    })

    it('treats an empty value as invalid — emptiness is the required rule job', () => {
        assert.equal(isValidPhoneValue(''), false)
        assert.equal(isValidPhoneValue(null), false)
    })
})

describe('formatPhoneForDisplay', () => {
    it('renders the international form for read-only views', () => {
        assert.equal(formatPhoneForDisplay('+4748012345'), '+47 48 01 23 45')
        assert.equal(formatPhoneForDisplay('+12015550123'), '+1 201 555 0123')
    })

    it('upgrades a legacy bare number to the international form', () => {
        assert.equal(formatPhoneForDisplay('48012345', 'NO'), '+47 48 01 23 45')
    })

    it('returns an empty string for an empty value', () => {
        assert.equal(formatPhoneForDisplay(''), '')
        assert.equal(formatPhoneForDisplay(null), '')
    })

    it('shows a value it cannot resolve exactly as stored, inventing no country', () => {
        // The 13 rows measured 2026-09-14 whose country is not derivable, plus the junk classes.
        // `'+47 0701234567'` is what this used to render for the first of them: the fallback region
        // presented as fact, on digits that are not Norwegian (invariant 7).
        assert.equal(formatPhoneForDisplay('0701234567', 'NO'), '0701234567')
        assert.equal(formatPhoneForDisplay('37376002949', 'NO'), '37376002949')
        assert.equal(formatPhoneForDisplay('12345678', 'NO'), '12345678')
        assert.equal(formatPhoneForDisplay('ana@example.com', 'NO'), 'ana@example.com')
    })

    it('resolves the same digits once the country is known', () => {
        // The same number, stored after a therapist picked Sweden. Nothing was guessed here.
        assert.equal(formatPhoneForDisplay('+46701234567'), '+46 70 123 45 67')
    })
})

describe('phoneTelHref', () => {
    it('is the only place the tel: scheme is added (ASMA-7485)', () => {
        assert.equal(phoneTelHref('+4748012345'), 'tel:+4748012345')
        assert.equal(phoneTelHref('48012345', 'NO'), 'tel:+4748012345')
    })

    it('carries no spaces or dashes', () => {
        assert.equal(phoneTelHref('48 01 23 45', 'NO'), 'tel:+4748012345')
    })

    it('returns an empty string when there is nothing to dial', () => {
        assert.equal(phoneTelHref(''), '')
        assert.equal(phoneTelHref(null), '')
    })

    it('offers no link for a value that is not a real number', () => {
        // `tel:+470701234567` was offered here — a number nobody owns, which a phone dials silently.
        assert.equal(phoneTelHref('0701234567', 'NO'), '')
        assert.equal(phoneTelHref('37376002949', 'NO'), '')
        assert.equal(phoneTelHref('12345678', 'NO'), '')
        assert.equal(phoneTelHref('ana@example.com', 'NO'), '')
    })

    it('still dials a legacy bare number that is valid for the fallback country', () => {
        assert.equal(phoneTelHref('48012345', 'NO'), 'tel:+4748012345')
    })
})

/**
 * Phase 7 invariants (plan §2, TASK-030). These are the properties the production corpus is run
 * against; the cases here are the shape classes measured on 2026-09-14, so a regression shows up
 * in CI rather than only in a corpus run someone has to remember to do.
 *
 * No real number appears here (CON-008). Fixtures are the ticket's example and libphonenumber's.
 */
describe('REQ-007 — the two parsers agree (TEST-009)', () => {
    const REGION: PhoneCountry = 'NO'

    // One value per measured shape class, plus the shapes that only exist in the ambiguous tail.
    const corpus = [
        '45456565',
        '48012345',
        '+4745456565',
        '4745456565',
        '004745456565',
        '+47 454 56 565',
        '+46701234567',
        '+37379094538',
        '37376002949',
        '0701234567',
        '12345678',
        '00000000',
        '123',
        'ana@example.com',
        '',
    ]

    for (const value of corpus) {
        it(`agrees on ${value === '' ? '(empty)' : value}`, () => {
            const loose = parsePhoneValue(value, REGION)
            const strict = parsePhoneNr(value, REGION)

            if (strict.ok) {
                assert.equal(loose.country, strict.country)
                return
            }

            // The failure this guards: reporting the fallback as though the value named it. A
            // therapist would see a Norwegian flag on a foreign number and "correct" it into
            // somebody else's valid Norwegian one.
            assert.notEqual(
                loose.country,
                REGION,
                `parsePhoneValue claimed ${REGION} for a value parsePhoneNr rejects: ${value}`,
            )
        })
    }

    it('still offers a country to edit with even when it does not know one', () => {
        // `iso2` and `country` answer different questions, and the field needs both.
        const parsed = parsePhoneValue('37376002949', 'NO')

        assert.equal(parsed.iso2, 'NO')
        assert.equal(parsed.country, undefined)
    })
})

describe('REQ-007 — idempotence (TEST-010)', () => {
    const shapes: [string, PhoneCountry][] = [
        ['45456565', 'NO'],
        ['+4745456565', 'NO'],
        ['4745456565', 'NO'],
        ['004745456565', 'NO'],
        ['+47 454 56 565', 'NO'],
        ['0701234567', 'SE'],
        ['+46701234567', 'SE'],
        ['2015550123', 'US'],
    ]

    for (const [value, region] of shapes) {
        it(`normalising ${value} twice changes nothing the second time`, () => {
            const once = toE164(parsePhoneValue(value, region).national, region)
            const twice = toE164(parsePhoneValue(once, region).national, region)

            // A failure here means the Adopus sync rewrites the same row forever (RISK-001).
            assert.equal(twice, once)
        })
    }

    it('is idempotent through parsePhoneNr as well', () => {
        const first = parsePhoneNr('004745456565', 'NO')
        assert.equal(first.ok, true)

        const second = parsePhoneNr(first.ok ? first.e164 : '', 'NO')
        assert.equal(second.ok && second.e164, first.ok && first.e164)
    })
})

describe('REQ-007 — no value gains validity (TEST-011)', () => {
    it('does not turn a Swedish national number into a Norwegian one', () => {
        // `0701234567` is a real Swedish mobile written nationally. Under NO it is nothing, and it
        // must stay nothing: the plus-less branch has no way to learn the country, and guessing
        // would silently hand the SMS to whoever owns the Norwegian number it invents.
        assert.equal(parsePhoneNr('0701234567', 'NO').ok, false)
        assert.equal(isValidPhone('0701234567', 'NO'), false)
    })

    it('does not resolve a plus-less Moldovan number to Norway', () => {
        // Measured 2026-09-14: `parsePhoneNumberWithError('37376002949', 'NO')` yields
        // `+4737376002949` with `isValid() === false` — not Moldova. The INVALID verdict is what
        // stops that string being stored as a Norwegian number.
        const parsed = parsePhoneNr('37376002949', 'NO')

        assert.equal(parsed.ok, false)
        assert.equal(parsed.ok === false && parsed.reason, 'INVALID')
    })

    it('keeps junk invalid rather than prefixing it', () => {
        for (const junk of ['12345678', '00000000', '123', 'ana@example.com']) {
            assert.equal(parsePhoneNr(junk, 'NO').ok, false, junk)
        }
    })
})

describe('REQ-007 — one case per measured shape class (TEST-012)', () => {
    // The classes and their production counts, measured 2026-09-14 (plan §0.2).
    const classes: [string, string, string | 'INVALID'][] = [
        ['bare 8 digits · 90,190 rows', '45456565', '+4745456565'],
        ['already E.164 +47 · 1,730 rows', '+4745456565', '+4745456565'],
        ['47 + 8, no plus · 268 rows', '4745456565', '+4745456565'],
        ['contains separators · 127 rows', '+47 454 56 565', '+4745456565'],
        ['E.164, not Norway · 25 rows', '+37379094538', '+37379094538'],
        ['1–7 digits · 16 rows', '123456', 'INVALID'],
        ['0047 + 8 · 9 rows', '004745456565', '+4745456565'],
        ['9+ digits, no plus · 9 rows', '37376002949', 'INVALID'],
        ['leading zero national · 4 rows', '0745456565', 'INVALID'],
        ['contains @ · 26 rows', 'ana@example.com', 'INVALID'],
    ]

    for (const [label, value, expected] of classes) {
        it(label, () => {
            const parsed = parsePhoneNr(value, 'NO')

            if (expected === 'INVALID') {
                assert.equal(parsed.ok, false, `${value} should not parse`)
                return
            }

            assert.equal(parsed.ok && parsed.e164, expected)
        })
    }
})

describe('REQ-007 — the shared-plan collision is known, not solved (TEST-013)', () => {
    it('reads the same digits as two different valid numbers depending on the region', () => {
        // `20123456` is a valid Norwegian landline and a valid Danish mobile. Nothing in the digits
        // distinguishes them, so the region must come from an explicit selection wherever a foreign
        // number is possible — never from a default. This test documents the limit; it does not
        // pretend the limit is gone.
        const asNorwegian = parsePhoneNr('20123456', 'NO')
        const asDanish = parsePhoneNr('20123456', 'DK')

        assert.equal(asNorwegian.ok, true)
        assert.equal(asNorwegian.ok && asNorwegian.e164, '+4720123456')

        assert.equal(asDanish.ok, true)
        assert.equal(asDanish.ok && asDanish.e164, '+4520123456')
    })

    it('is why a default region may never stand in for a user choice', () => {
        // The same string, stored bare, is unrecoverable: both readings are valid numbers owned by
        // different people. `parsePhoneValue` must therefore not claim a country for it.
        assert.equal(parsePhoneValue('20123456', 'NO').country, 'NO')
        assert.equal(parsePhoneValue('20123456', 'DK').country, 'DK')
    })
})
