/**
 * Country-aware phone primitives for ASMA forms (ASMA-7485).
 *
 * Published as `asma-core-helpers/phone` and deliberately **not** re-exported from
 * the root barrel: the root entry is what the ESM kernel bundles and serves to all
 * 17 fleet apps, and `libphonenumber-js` has no business in that shared unit. As a
 * subpath it is absent from `KERNEL_EXTERNAL_SPECIFIERS`, so it bundles into the two
 * apps that actually render a phone field instead.
 *
 * @see asma-modules/_docs/adr/adr-g-0017-frontend-form-state-and-validation-ownership.md:49 — DEC-001, why the rules live here and not in asma-ui-core
 */

export {
    DEFAULT_PHONE_COUNTRY,
    findCountryByDialCode,
    getPhoneDialCode,
    listPhoneCountries,
    matchesPhoneCountry,
    type PhoneCountry,
    type PhoneCountryOption,
} from './phoneCountries.js'

export {
    formatNationalAsYouType,
    formatPhoneForDisplay,
    isValidPhone,
    isValidPhoneValue,
    parsePhoneNr,
    parsePhoneValue,
    phoneTelHref,
    PHONE_MAX_DIGITS,
    PHONE_MIN_DIGITS,
    toE164,
    type ParsedPhone,
    type PhoneNrParse,
} from './phoneNumber.js'

export { phoneExample } from './phoneExample.js'
