/**
 * Default NB/EN validation catalog for ASMA forms (ASMA-7729).
 * Apps override via shallow merge — translations stay in app i18n.
 */

export type ValidationLocale = 'nb' | 'en'

export type ValidationMessageKey =
    | 'required'
    | 'invalid_email'
    | 'invalid_name'
    | 'invalid_phone'
    | 'invalid_personal_number'
    | 'duplicate_email'
    | 'duplicate_journal_id'
    | 'duplicate_personal_number'
    | 'duplicate_employee_no'
    | 'duplicate_phone'
    | 'duplicate_username'

export type ValidationMessages = Record<ValidationMessageKey, string>

export const validationMessages = {
    nb: {
        required: 'Dette feltet er obligatorisk',
        invalid_email: 'Ugyldig epost',
        invalid_name: 'Ugyldig navn',
        invalid_phone: 'Ugyldig telefon',
        invalid_personal_number: 'Ugyldig personnummer',
        duplicate_email: 'Duplikat epost',
        duplicate_journal_id: 'Duplikat journal id',
        duplicate_personal_number: 'Duplikat personnummer',
        duplicate_employee_no: 'Duplikat Ansattnr.',
        duplicate_phone: 'Duplikat telefon',
        duplicate_username: 'Duplikat brukernavn',
    },
    en: {
        required: 'This field is required',
        invalid_email: 'Invalid email',
        invalid_name: 'Invalid name',
        invalid_phone: 'Invalid phone',
        invalid_personal_number: 'Invalid personal number',
        duplicate_email: 'Duplicate email',
        duplicate_journal_id: 'Duplicate journal id',
        duplicate_personal_number: 'Duplicate personal number',
        duplicate_employee_no: 'Duplicate employee no.',
        duplicate_phone: 'Duplicate phone',
        duplicate_username: 'Duplicate username',
    },
} as const satisfies Record<ValidationLocale, ValidationMessages>

/** Shallow-merge overrides over the locale catalog (per-app i18n). */
export function getValidationMessages(
    locale: ValidationLocale,
    overrides?: Partial<ValidationMessages>,
): ValidationMessages {
    return { ...validationMessages[locale], ...overrides }
}

/**
 * REQ-003: actionable "what's wrong — how to fix" composition.
 * e.g. errorWithHint('Invalid email', 'name@carasent.com') → 'Invalid email — name@carasent.com'
 */
export function errorWithHint(error: string, hint: string): string {
    return `${error} — ${hint}`
}
