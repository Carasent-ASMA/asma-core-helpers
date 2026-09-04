/**
 * Country dial-code catalogue for the ASMA phone field (ASMA-7485).
 *
 * Country names come from the platform's own `Intl.DisplayNames` rather than a
 * checked-in translation table, so every locale the browser knows is covered
 * without shipping (or maintaining) 245 names per language.
 */

import { getCountries, getCountryCallingCode, isSupportedCountry, Metadata } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'

/** ISO 3166-1 alpha-2 code, narrowed to what the phone metadata actually supports. */
export type PhoneCountry = CountryCode

/** Pre-selected country for every ASMA phone field — see ASMA-7485. */
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = 'NO'

export interface PhoneCountryOption {
    iso2: PhoneCountry
    /** Calling code without the leading `+`, e.g. `'47'`. */
    dialCode: string
    /** Country name in the requested locale, e.g. `'Norge'` / `'Norway'`. */
    name: string
}

const optionsByLocale = new Map<string, readonly PhoneCountryOption[]>()

function countryName(iso2: PhoneCountry, displayNames: Intl.DisplayNames): string {
    // `of` returns undefined for codes the ICU data does not know; the code itself
    // is a better fallback than an empty row.
    return displayNames.of(iso2) ?? iso2
}

/**
 * Every supported country, sorted by localized name.
 *
 * Ordering of the *rendered* list (pinning the selected country first) belongs to
 * the UI; this returns the stable alphabetical catalogue. Memoized per locale
 * because the underlying `Intl.DisplayNames` lookup runs once per country.
 */
export function listPhoneCountries(locale: string): readonly PhoneCountryOption[] {
    const cached = optionsByLocale.get(locale)
    if (cached !== undefined) return cached

    const displayNames = new Intl.DisplayNames([locale], { type: 'region' })
    const collator = new Intl.Collator(locale)

    const options = getCountries()
        .map((iso2) => ({
            iso2,
            dialCode: getCountryCallingCode(iso2),
            name: countryName(iso2, displayNames),
        }))
        .sort((left, right) => collator.compare(left.name, right.name))

    optionsByLocale.set(locale, options)
    return options
}

export function getPhoneDialCode(iso2: PhoneCountry): string {
    return getCountryCallingCode(iso2)
}

/**
 * Search predicate for the country picker: matches on localized name **or** on the
 * calling code, so both `"Norway"` and `"47"` narrow the list to +47 (ASMA-7485).
 *
 * A leading `+` in the query is ignored so pasting `+47` works.
 */
export function matchesPhoneCountry(option: PhoneCountryOption, query: string): boolean {
    const trimmed = query.trim()
    if (trimmed.length === 0) return true

    if (option.name.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase())) return true

    const digits = trimmed.replace(/^\+/, '').replace(/\D/g, '')
    return digits.length > 0 && option.dialCode.startsWith(digits)
}

/** Calling codes are at most three digits in the E.164 plan. */
const MAX_CALLING_CODE_LENGTH = 3

/**
 * `Metadata` exposes the calling-code → countries index at runtime, but the shipped
 * typings declare only `selectNumberingPlan`/`numberingPlan`. Narrowed here against
 * the inspected runtime shape and guarded at the call site, so a future release that
 * drops the method degrades to "country not found" instead of throwing.
 */
interface CallingCodeIndex {
    getCountryCodesForCallingCode?: (callingCode: string) => readonly string[] | undefined
}

/**
 * The primary country for a calling code — `'1'` → `US`, not whichever NANP
 * territory happens to sort first. The metadata index lists the main country first.
 */
function mainCountryForCallingCode(callingCode: string): PhoneCountry | undefined {
    const index = new Metadata() as unknown as CallingCodeIndex
    const candidate = index.getCountryCodesForCallingCode?.(callingCode)?.[0]

    return candidate !== undefined && isSupportedCountry(candidate) ? candidate : undefined
}

/**
 * The country owning the longest calling-code prefix of `digits`.
 *
 * Longest-prefix rather than first-match because calling codes are not prefix-free
 * (`+1` vs `+7`, `+47` vs `+473`), and main-country-wins because 25 countries share
 * `+1` — a plain scan resolves every North-American number to Antigua.
 */
export function findCountryByDialCode(digits: string): PhoneCountry | undefined {
    for (let length = Math.min(MAX_CALLING_CODE_LENGTH, digits.length); length >= 1; length -= 1) {
        const country = mainCountryForCallingCode(digits.slice(0, length))
        if (country !== undefined) return country
    }

    return undefined
}
