/**
 * Example numbers for the actionable half of a validation message (ADR-0017 REQ-003:
 * "what's wrong — how to fix"), e.g. `errorWithHint(msgs.invalid_phone, phoneExample('NO'))`
 * → `'Invalid phone — Ex: +47 40 61 23 45'`.
 *
 * Kept in its own module so consumers that only format or validate do not pull the
 * example metadata (~1.4 kB gz) into their bundle.
 */

import { getExampleNumber } from 'libphonenumber-js'
import examples from 'libphonenumber-js/examples.mobile.json'

import { getPhoneDialCode } from './phoneCountries.js'
import type { PhoneCountry } from './phoneCountries.js'

/**
 * A representative mobile number for the country, in international form.
 *
 * Falls back to the bare dial code for the handful of territories that have no
 * example in the metadata, so the hint is never an empty string.
 */
export function phoneExample(iso2: PhoneCountry): string {
    return getExampleNumber(iso2, examples)?.formatInternational() ?? `+${getPhoneDialCode(iso2)}`
}
