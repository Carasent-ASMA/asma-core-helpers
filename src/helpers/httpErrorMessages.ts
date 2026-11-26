import type { ValidationLocale } from '../validation/messages.js'

export type HttpErrorMessageOptions = { locale?: string }

const httpErrorMessages = {
    en: {
        session: 'Your session has expired. Sign in again.',
        permission: 'You do not have permission to do this.',
        missing: 'This no longer exists. Reload the page and try again.',
        conflict: 'This action conflicts with the current state. Reload the page and try again.',
        tooLarge: 'The request is too large. Reduce its size and try again.',
        rateLimit: 'Too many requests. Wait a little and try again.',
        validation: 'Check the form fields and try again.',
        unexpected: 'Something went wrong. Try again, and contact support if it keeps happening.',
        network: 'Could not connect. Check your connection and try again.',
        timeout: 'The request took too long. Try again.',
        interrupted: 'The request was interrupted. Try again.',
    },
    nb: {
        session: 'Økten din er utløpt. Logg inn på nytt.',
        permission: 'Du har ikke tilgang til å gjøre dette.',
        missing: 'Dette finnes ikke lenger. Last inn siden på nytt og prøv igjen.',
        conflict: 'Handlingen er i konflikt med gjeldende status. Last inn siden på nytt og prøv igjen.',
        tooLarge: 'Forespørselen er for stor. Reduser innholdet og prøv igjen.',
        rateLimit: 'For mange forespørsler. Vent litt og prøv igjen.',
        validation: 'Kontroller feltene i skjemaet og prøv igjen.',
        unexpected: 'Noe gikk galt. Prøv igjen, og kontakt brukerstøtte hvis problemet fortsetter.',
        network: 'Kunne ikke koble til. Kontroller forbindelsen og prøv igjen.',
        timeout: 'Forespørselen tok for lang tid. Prøv igjen.',
        interrupted: 'Forespørselen ble avbrutt. Prøv igjen.',
    },
} satisfies Record<ValidationLocale, Record<string, string>>

export function httpErrorLocale(options: HttpErrorMessageOptions): ValidationLocale {
    const language = options.locale?.toLowerCase().split(/[-_]/)[0]
    return language === 'no' || language === 'nb' ? 'nb' : 'en'
}

export function httpFallback(status: number, locale: ValidationLocale): string {
    const messages = httpErrorMessages[locale]
    if (status === 401) return messages.session
    if (status === 403) return messages.permission
    if (status === 404) return messages.missing
    if (status === 409) return messages.conflict
    if (status === 413) return messages.tooLarge
    if (status === 429) return messages.rateLimit
    if (status === 408 || status === 504) return messages.timeout
    if (status === 400 || status === 422) return messages.validation
    return messages.unexpected
}

export function httpTransportFallback(
    reason: 'network' | 'timeout' | 'unexpected' | 'interrupted',
    locale: ValidationLocale,
): string {
    return httpErrorMessages[locale][reason]
}
