/**
 * Phone-number formatting, parsing and validation for ASMA forms (ASMA-7485).
 *
 * The stored form is bare E.164 (`+4748012345`) — digits and a leading `+`, no
 * spaces, no `tel:`. The `tel:` scheme belongs to the render of a click-to-call
 * link and is produced by `phoneTelHref`, never written to a field.
 */

import { AsYouType, isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js'

import { DEFAULT_PHONE_COUNTRY, findCountryByDialCode, getPhoneDialCode } from './phoneCountries.js'
import type { PhoneCountry } from './phoneCountries.js'

/** Shortest and longest national significant number in the E.164 plan. */
export const PHONE_MIN_DIGITS = 4
export const PHONE_MAX_DIGITS = 15

export interface ParsedPhone {
    iso2: PhoneCountry
    /** National significant number, digits only — no dial code, no separators. */
    national: string
}

const digitsOnly = (value: string): string => value.replace(/\D/g, '')

/**
 * Split a stored value into the country and the national number the field edits.
 *
 * Three shapes reach this function:
 *   - E.164 (`'+4748012345'`) — the format this ticket introduces;
 *   - a bare national number (`'48012345'`) — every record written before it, which
 *     is why `fallbackIso2` exists rather than the value being rejected;
 *   - a partially typed `+47…`, which `parsePhoneNumberFromString` cannot parse yet
 *     and which therefore falls through to the longest-dial-code match.
 */
export function parsePhoneValue(
    value: string | null | undefined,
    fallbackIso2: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): ParsedPhone {
    const trimmed = (value ?? '').trim()
    if (trimmed.length === 0) return { iso2: fallbackIso2, national: '' }

    if (!trimmed.startsWith('+')) {
        return { iso2: fallbackIso2, national: digitsOnly(trimmed) }
    }

    const parsed = parsePhoneNumberFromString(trimmed)
    if (parsed?.country !== undefined) {
        return { iso2: parsed.country, national: parsed.nationalNumber }
    }

    const digits = digitsOnly(trimmed)

    // Keep the country the caller already holds when the digits still agree with it,
    // so typing `+47…` one character at a time never reassigns the user's selection
    // to another country sharing the prefix.
    const fallbackDialCode = getPhoneDialCode(fallbackIso2)
    if (digits.startsWith(fallbackDialCode)) {
        return { iso2: fallbackIso2, national: digits.slice(fallbackDialCode.length) }
    }

    const iso2 = findCountryByDialCode(digits)
    if (iso2 === undefined) return { iso2: fallbackIso2, national: digits }

    return { iso2, national: digits.slice(getPhoneDialCode(iso2).length) }
}

/**
 * Compose the stored value from the country and whatever the user typed.
 *
 * Deliberately does not validate — an in-progress number must still round-trip
 * through the store so the field can show it back. Use `isValidPhone` for the gate.
 * Returns `''` for an empty national part so an untouched field stores nothing
 * rather than a bare `'+47'`.
 */
export function toE164(nationalInput: string, iso2: PhoneCountry): string {
    const digits = digitsOnly(nationalInput)
    if (digits.length === 0) return ''

    return `+${getPhoneDialCode(iso2)}${digits}`
}

/**
 * Progressive per-country grouping for the input mask, e.g. `'48012345'` → `'48 01 23 45'`
 * for NO, `'70 123 45 67'` for SE and `'213 373 4253'` for US.
 *
 * Groups by the country's **international** format rather than its national one, and
 * the difference is not cosmetic: countries with a trunk prefix (SE, GB, DE, FR) define
 * their national formats *with* the leading `0`, so feeding the bare national number to
 * `AsYouType(iso2)` returns it unformatted. The field edits the national part while the
 * selector carries the country code, which is exactly the international shape.
 *
 * Grouping therefore follows each country's official format — for Norwegian numbers
 * `xx xx xx xx`, not the `### ## ###` the legacy `NORWEGIAN_PHONE_NUMBER` constant
 * hardcoded for every Norwegian number regardless of its prefix.
 */
export function formatNationalAsYouType(nationalInput: string, iso2: PhoneCountry): string {
    const digits = digitsOnly(nationalInput)
    if (digits.length === 0) return ''

    const dialCode = `+${getPhoneDialCode(iso2)}`
    const formatted = new AsYouType().input(`${dialCode}${digits}`)

    return formatted.startsWith(dialCode) ? formatted.slice(dialCode.length).trimStart() : formatted
}

/**
 * Whether the national number is a real, dialable number for the country —
 * a per-country pattern check, not a digit count. `'00000000'` and `'12345678'`
 * are both rejected for NO, `'48012345'` is accepted.
 */
export function isValidPhone(nationalInput: string, iso2: PhoneCountry): boolean {
    const digits = digitsOnly(nationalInput)
    if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return false

    return isValidPhoneNumber(digits, iso2)
}

/** Whether a stored value is a valid number, resolving its country from the value itself. */
export function isValidPhoneValue(
    value: string | null | undefined,
    fallbackIso2: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): boolean {
    const { iso2, national } = parsePhoneValue(value, fallbackIso2)
    return isValidPhone(national, iso2)
}

/**
 * Human-readable international form for read-only views, e.g. `'+47 48 01 23 45'`.
 * Falls back to the raw value so an unparseable legacy record still renders.
 */
export function formatPhoneForDisplay(
    value: string | null | undefined,
    fallbackIso2: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): string {
    const trimmed = (value ?? '').trim()
    if (trimmed.length === 0) return ''

    const { iso2, national } = parsePhoneValue(trimmed, fallbackIso2)
    const parsed = parsePhoneNumberFromString(toE164(national, iso2))

    return parsed?.formatInternational() ?? trimmed
}

/**
 * `tel:` URI for a click-to-call link — the single place the scheme is added (ASMA-7485).
 * Returns `''` when there is nothing to dial, so callers can skip rendering the link.
 */
export function phoneTelHref(
    value: string | null | undefined,
    fallbackIso2: PhoneCountry = DEFAULT_PHONE_COUNTRY,
): string {
    const { iso2, national } = parsePhoneValue(value, fallbackIso2)
    const e164 = toE164(national, iso2)

    return e164.length === 0 ? '' : `tel:${e164}`
}
