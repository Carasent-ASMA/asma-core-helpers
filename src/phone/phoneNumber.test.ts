import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    formatNationalAsYouType,
    formatPhoneForDisplay,
    isValidPhone,
    isValidPhoneValue,
    parsePhoneValue,
    phoneTelHref,
    toE164,
} from './phoneNumber.js'

describe('parsePhoneValue', () => {
    it('splits a stored E.164 value into country and national number', () => {
        assert.deepEqual(parsePhoneValue('+4748012345'), { iso2: 'NO', national: '48012345' })
        assert.deepEqual(parsePhoneValue('+12015550123', 'NO'), { iso2: 'US', national: '2015550123' })
    })

    it('reads a pre-ASMA-7485 bare national number as the fallback country', () => {
        // Every record written before this ticket is 8 bare digits with no country.
        assert.deepEqual(parsePhoneValue('48012345', 'NO'), { iso2: 'NO', national: '48012345' })
        assert.deepEqual(parsePhoneValue('48012345', 'SE'), { iso2: 'SE', national: '48012345' })
    })

    it('keeps the caller country while a matching number is still being typed', () => {
        assert.deepEqual(parsePhoneValue('+47', 'NO'), { iso2: 'NO', national: '' })
        assert.deepEqual(parsePhoneValue('+4748', 'NO'), { iso2: 'NO', national: '48' })
    })

    it('switches country when the typed prefix belongs to another one', () => {
        assert.deepEqual(parsePhoneValue('+46701', 'NO'), { iso2: 'SE', national: '701' })
    })

    it('treats empty, whitespace and nullish values as an empty number', () => {
        for (const value of ['', '   ', null, undefined]) {
            assert.deepEqual(parsePhoneValue(value, 'NO'), { iso2: 'NO', national: '' })
        }
    })

    it('falls back to the given country for an unknown calling code', () => {
        assert.deepEqual(parsePhoneValue('+9991234', 'NO'), { iso2: 'NO', national: '9991234' })
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

    it('round-trips through parsePhoneValue', () => {
        const parsed = parsePhoneValue(toE164('48012345', 'NO'))
        assert.deepEqual(parsed, { iso2: 'NO', national: '48012345' })
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
})
