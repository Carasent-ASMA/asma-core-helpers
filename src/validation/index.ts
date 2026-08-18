/**
 * Pure validation messages + rule primitives for ASMA forms.
 *
 * Published as `asma-core-helpers/validation` (not the root barrel) so Node/Bun
 * consumers never pull browser-only helpers that read `window` on import.
 */

export {
    errorWithHint,
    getValidationMessages,
    validationMessages,
    type ValidationLocale,
    type ValidationMessageKey,
    type ValidationMessages,
} from './messages.js'

export {
    email,
    emailRegex,
    hasDigit,
    httpUrl,
    name,
    nameRegex,
    pattern,
    phoneNr,
    phoneNrRegex,
    pnr,
    required,
} from './rules.js'
