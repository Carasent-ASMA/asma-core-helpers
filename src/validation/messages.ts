/**
 * Default NB/EN validation catalog for ASMA forms (ASMA-7729, ASMA-8073).
 * EN copy follows Figma "Admin panel → Error messages" (node 11381:172081).
 * Placeholders use `{name}` and are filled by `formatValidationMessage`.
 * Apps override via shallow merge — translations stay in app i18n.
 */

export type ValidationLocale = 'nb' | 'en'

export type ValidationMessageKey =
    | 'required'
    | 'invalid_email'
    | 'email_missing_at'
    | 'invalid_name'
    | 'invalid_phone'
    | 'invalid_personal_number'
    | 'personal_number_length'
    | 'personal_number_birth_date'
    | 'personal_number_enter'
    | 'duplicate_email'
    | 'duplicate_journal_id'
    | 'duplicate_personal_number'
    | 'duplicate_employee_no'
    | 'duplicate_phone'
    | 'duplicate_username'
    | 'duplicate_category'
    | 'min_length'
    | 'max_length'
    | 'length_between'
    | 'digits_only'
    | 'letters_numbers_only'
    | 'subdomain_chars'
    | 'invalid_subdomain'
    | 'date_invalid_format'
    | 'date_invalid_day'
    | 'date_invalid_month'
    | 'date_year_range'
    | 'date_invalid'
    | 'date_after_start'
    | 'date_unavailable'
    | 'date_today_or_future'
    | 'date_today_or_earlier'
    | 'date_of_birth_invalid_format'
    | 'date_of_birth_invalid'
    | 'date_of_birth_not_future'
    | 'time_invalid_format'
    | 'time_after_start'
    | 'hour_invalid'
    | 'hour_range'
    | 'minutes_quarter'
    | 'time_greater_than_zero'
    | 'select_at_least_one_recipient'
    | 'category_from_list'
    | 'customer_required'
    | 'patient_invalid'
    | 'file_required'
    | 'file_download_required'
    | 'file_count_max'
    | 'file_single'
    | 'file_empty'
    | 'file_type'
    | 'file_media_type'
    | 'file_size_max'
    | 'code_invalid'
    | 'code_request_new'
    | 'code_wait'
    | 'phone_not_linked'
    | 'no_portal_access'
    | 'sign_in_method_unavailable'
    | 'credentials_invalid'
    | 'invitation_code_invalid'
    | 'refresh_and_try_again'
    | 'check_and_try_again'
    | 'reduce_data_and_try_again'
    | 'try_again'

export type ValidationMessages = Record<ValidationMessageKey, string>

export const validationMessages = {
    nb: {
        required: 'Obligatorisk',
        invalid_email: 'Skriv inn en gyldig e-postadresse med domene.',
        email_missing_at: 'Skriv inn en e-postadresse med @.',
        invalid_name: 'Bruk bokstaver, mellomrom, bindestrek eller apostrof.',
        invalid_phone: 'Skriv inn et gyldig telefonnummer, for eksempel +47 12 34 56 78.',
        invalid_personal_number: 'Skriv inn et gyldig personnummer.',
        personal_number_length: 'Skriv inn 11 sifre.',
        personal_number_birth_date: 'Skriv inn et gyldig personnummer. Sjekk fødselsdatoen.',
        personal_number_enter: 'Skriv inn personnummeret ditt.',
        duplicate_email: 'Skriv inn en annen e-postadresse.',
        duplicate_journal_id: 'Skriv inn en annen journal-ID.',
        duplicate_personal_number: 'Skriv inn et annet personnummer.',
        duplicate_employee_no: 'Skriv inn et annet ansattnummer.',
        duplicate_phone: 'Skriv inn et annet telefonnummer.',
        duplicate_username: 'Skriv inn et annet brukernavn.',
        duplicate_category: 'Skriv inn en annen kategori.',
        min_length: 'Skriv inn minst {n} tegn.',
        max_length: 'Skriv inn maks {n} tegn.',
        length_between: 'Skriv inn mellom {min} og {max} tegn.',
        digits_only: 'Skriv inn bare sifre.',
        letters_numbers_only: 'Bruk bare bokstaver og tall.',
        subdomain_chars: 'Bruk bare bokstaver, tall og bindestrek.',
        invalid_subdomain: 'Skriv inn et gyldig underdomene.',
        date_invalid_format: 'Skriv inn en gyldig dato i formatet DD.MM.ÅÅÅÅ.',
        date_invalid_day: 'Skriv inn en gyldig dag.',
        date_invalid_month: 'Skriv inn en gyldig måned.',
        date_year_range: 'Skriv inn et år mellom {min} og {max}.',
        date_invalid: 'Skriv inn en gyldig dato.',
        date_after_start: 'Velg en dato etter startdatoen.',
        date_unavailable: 'Velg en annen dato.',
        date_today_or_future: 'Velg dagens dato eller en senere dato.',
        date_today_or_earlier: 'Velg dagens dato eller en tidligere dato.',
        date_of_birth_invalid_format: 'Skriv inn en gyldig fødselsdato i formatet DD.MM.ÅÅÅÅ.',
        date_of_birth_invalid: 'Skriv inn en gyldig fødselsdato.',
        date_of_birth_not_future: 'Skriv inn en fødselsdato som er i dag eller tidligere.',
        time_invalid_format: 'Skriv inn et gyldig klokkeslett i formatet TT:mm.',
        time_after_start: 'Velg et klokkeslett etter starttidspunktet.',
        hour_invalid: 'Skriv inn en gyldig time.',
        hour_range: 'Skriv inn en time mellom {min} og {max}.',
        minutes_quarter: 'Skriv inn 0, 15, 30 eller 45 minutter.',
        time_greater_than_zero: 'Skriv inn en tid som er større enn 0.',
        select_at_least_one_recipient: 'Velg minst én mottaker.',
        category_from_list: 'Velg en kategori fra listen.',
        customer_required: 'Velg en kunde.',
        patient_invalid: 'Velg en gyldig pasient.',
        file_required: 'Velg en fil å laste opp.',
        file_download_required: 'Velg en fil å laste ned.',
        file_count_max: 'Velg opptil {n} filer.',
        file_single: 'Velg én fil.',
        file_empty: 'Denne filen er tom. Velg en annen fil.',
        file_type: 'Velg en støttet filtype.',
        file_media_type: 'Velg en støttet bilde- eller videofil.',
        file_size_max: 'Velg en fil som ikke er større enn {size}.',
        code_invalid: 'Skriv inn en gyldig kode.',
        code_request_new: 'Be om en ny kode.',
        code_wait: 'Vent {n} minutter før du ber om en ny kode.',
        phone_not_linked: 'Skriv inn et telefonnummer som er knyttet til en konto.',
        no_portal_access: 'Kontakt administratoren din for å få tilgang til denne portalen.',
        sign_in_method_unavailable: 'Denne innloggingsmetoden er ikke tilgjengelig for organisasjonen din.',
        credentials_invalid: 'Skriv inn riktig e-postadresse og passord.',
        invitation_code_invalid: 'Skriv inn en gyldig invitasjonskode på 25 tegn.',
        refresh_and_try_again: 'Last inn siden på nytt og prøv igjen.',
        check_and_try_again: 'Sjekk svaret ditt og prøv igjen.',
        reduce_data_and_try_again: 'Reduser mengden data og prøv igjen.',
        try_again: 'Prøv igjen.',
    },
    en: {
        required: 'Required',
        invalid_email: 'Enter a valid email address with a domain.',
        email_missing_at: 'Enter an email address with an @.',
        invalid_name: 'Use letters, spaces, hyphens, or apostrophes.',
        invalid_phone: 'Enter a valid phone number, like +47 12 34 56 78.',
        invalid_personal_number: 'Enter a valid personal number.',
        personal_number_length: 'Enter 11 digits.',
        personal_number_birth_date: 'Enter a valid personal number. Check the birth date.',
        personal_number_enter: 'Enter your personal number.',
        duplicate_email: 'Enter a different email address.',
        duplicate_journal_id: 'Enter a different journal ID.',
        duplicate_personal_number: 'Enter a different personal number.',
        duplicate_employee_no: 'Enter a different employee number.',
        duplicate_phone: 'Enter a different phone number.',
        duplicate_username: 'Enter a different username.',
        duplicate_category: 'Enter a different category.',
        min_length: 'Enter at least {n} characters.',
        max_length: 'Enter no more than {n} characters.',
        length_between: 'Enter between {min} and {max} characters.',
        digits_only: 'Enter digits only.',
        letters_numbers_only: 'Use letters and numbers only.',
        subdomain_chars: 'Use letters, numbers, and hyphens only.',
        invalid_subdomain: 'Enter a valid subdomain.',
        date_invalid_format: 'Enter a valid date in DD.MM.YYYY format.',
        date_invalid_day: 'Enter a valid day.',
        date_invalid_month: 'Enter a valid month.',
        date_year_range: 'Enter a year between {min} and {max}.',
        date_invalid: 'Enter a valid date.',
        date_after_start: 'Select a date after the start date.',
        date_unavailable: 'Select another date.',
        date_today_or_future: 'Select today or a future date.',
        date_today_or_earlier: 'Select today or an earlier date.',
        date_of_birth_invalid_format: 'Enter a valid date of birth in DD.MM.YYYY format.',
        date_of_birth_invalid: 'Enter a real date of birth.',
        date_of_birth_not_future: "Enter a date of birth that's today or earlier.",
        time_invalid_format: 'Enter a valid time in HH:mm format.',
        time_after_start: 'Select a time after start time.',
        hour_invalid: 'Enter a valid hour.',
        hour_range: 'Enter an hour between {min} and {max}.',
        minutes_quarter: 'Enter 0, 15, 30, or 45 minutes.',
        time_greater_than_zero: 'Enter a time greater than 0.',
        select_at_least_one_recipient: 'Select at least one recipient.',
        category_from_list: 'Select a category from the list.',
        customer_required: 'Select a customer.',
        patient_invalid: 'Select a valid patient.',
        file_required: 'Select file to upload.',
        file_download_required: 'Select a file to download.',
        file_count_max: 'Select up to {n} files.',
        file_single: 'Select one file.',
        file_empty: 'This file is empty. Select another file.',
        file_type: 'Select a supported file type.',
        file_media_type: 'Select a supported image or video file.',
        file_size_max: 'Select a file no larger than {size}.',
        code_invalid: 'Enter a valid code.',
        code_request_new: 'Request a new code.',
        code_wait: 'Wait {n} minutes before requesting a new code.',
        phone_not_linked: 'Enter a phone number linked to an account.',
        no_portal_access: 'Contact your administrator for access to this portal.',
        sign_in_method_unavailable: "This sign-in method isn't available for your organization.",
        credentials_invalid: 'Enter the correct email and password.',
        invitation_code_invalid: 'Enter a valid 25-character invitation code.',
        refresh_and_try_again: 'Refresh the page and try again.',
        check_and_try_again: 'Check your answer and try again.',
        reduce_data_and_try_again: 'Reduce the amount of data and try again.',
        try_again: 'Try again.',
    },
} as const satisfies Record<ValidationLocale, ValidationMessages>

/** Shallow-merge overrides over the locale catalog (per-app i18n). */
export function getValidationMessages(
    locale: ValidationLocale,
    overrides?: Partial<ValidationMessages>,
): ValidationMessages {
    return { ...validationMessages[locale], ...overrides }
}

export type ValidationMessageParams = Record<string, string | number>

/** Fills `{name}` placeholders; unknown placeholders stay visible so a missing param is caught in review. */
export function formatValidationMessage(template: string, params?: ValidationMessageParams): string {
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}

export function getValidationMessage(
    locale: ValidationLocale,
    key: ValidationMessageKey,
    params?: ValidationMessageParams,
): string {
    return formatValidationMessage(validationMessages[locale][key], params)
}

/**
 * REQ-003: actionable "what's wrong — how to fix" composition.
 * e.g. errorWithHint('Invalid email', 'name@carasent.com') → 'Invalid email — name@carasent.com'
 */
export function errorWithHint(error: string, hint: string): string {
    return `${error} — ${hint}`
}
