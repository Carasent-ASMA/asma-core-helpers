import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    DEFAULT_PHONE_COUNTRY,
    findCountryByDialCode,
    getPhoneDialCode,
    listPhoneCountries,
    matchesPhoneCountry,
} from './phoneCountries.js'
import type { PhoneCountryOption } from './phoneCountries.js'

const norway = (locale: string): PhoneCountryOption | undefined =>
    listPhoneCountries(locale).find((option) => option.iso2 === 'NO')

describe('DEFAULT_PHONE_COUNTRY', () => {
    it('pre-selects Norway (ASMA-7485)', () => {
        assert.equal(DEFAULT_PHONE_COUNTRY, 'NO')
    })
})

describe('listPhoneCountries', () => {
    it('covers every supported country with its calling code', () => {
        const options = listPhoneCountries('en')
        assert.equal(options.length, 245)
        assert.deepEqual(norway('en'), { iso2: 'NO', dialCode: '47', name: 'Norway' })
    })

    it('localizes names per locale instead of shipping a translation table', () => {
        assert.equal(norway('nb')?.name, 'Norge')
        assert.equal(norway('en')?.name, 'Norway')
    })

    it('sorts by localized name, so the order differs between locales', () => {
        const nb = listPhoneCountries('nb').map((option) => option.name)
        const en = listPhoneCountries('en').map((option) => option.name)

        assert.deepEqual(nb, [...nb].sort(new Intl.Collator('nb').compare))
        assert.deepEqual(en, [...en].sort(new Intl.Collator('en').compare))
        // Østerrike sorts last in nb, Austria near the front in en.
        assert.notEqual(nb.indexOf('Østerrike'), en.indexOf('Austria'))
    })

    it('memoizes per locale — the Intl lookup runs once per country', () => {
        assert.equal(listPhoneCountries('en'), listPhoneCountries('en'))
        assert.notEqual(listPhoneCountries('en'), listPhoneCountries('nb'))
    })
})

describe('getPhoneDialCode', () => {
    it('returns the calling code without a plus', () => {
        assert.equal(getPhoneDialCode('NO'), '47')
        assert.equal(getPhoneDialCode('US'), '1')
    })
})

describe('matchesPhoneCountry', () => {
    const option: PhoneCountryOption = { iso2: 'NO', dialCode: '47', name: 'Norway' }

    it('matches by country name, case-insensitively', () => {
        assert.equal(matchesPhoneCountry(option, 'nor'), true)
        assert.equal(matchesPhoneCountry(option, 'NORWAY'), true)
        assert.equal(matchesPhoneCountry(option, 'sweden'), false)
    })

    it('matches by calling code, with or without the plus', () => {
        assert.equal(matchesPhoneCountry(option, '47'), true)
        assert.equal(matchesPhoneCountry(option, '+47'), true)
        assert.equal(matchesPhoneCountry(option, '4'), true)
        assert.equal(matchesPhoneCountry(option, '61'), false)
    })

    it('keeps every row for an empty or whitespace query', () => {
        assert.equal(matchesPhoneCountry(option, ''), true)
        assert.equal(matchesPhoneCountry(option, '   '), true)
    })
})

describe('findCountryByDialCode', () => {
    it('resolves the main country of a shared calling code', () => {
        // 25 countries share +1; a first-match scan would answer Antigua.
        assert.equal(findCountryByDialCode('12015550123'), 'US')
        assert.equal(findCountryByDialCode('79161234567'), 'RU')
        assert.equal(findCountryByDialCode('447400123456'), 'GB')
    })

    it('prefers the longest matching calling code', () => {
        assert.equal(findCountryByDialCode('4748012345'), 'NO')
        assert.equal(findCountryByDialCode('46701234567'), 'SE')
    })

    it('returns undefined when no calling code matches', () => {
        assert.equal(findCountryByDialCode('9991234'), undefined)
        assert.equal(findCountryByDialCode(''), undefined)
    })
})
