import { getValidNorwegianPersonalNumber } from '../helpers/validateNorwegianPersonalNumber.js'

/** Copied from directory/asma-app-directory ActorToUpsertValidator regex helpers — keep pilot behavior identical. */
export const phoneNrRegex = /^\+?\d{6,13}$/
export const emailRegex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/
export const nameRegex = /^\s*\p{Lu}[\p{L}0-9-]*(\s+\p{L}[\p{L}0-9-]*)*\s*$/u

export function required(value: unknown): boolean {
    if (value == null) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
}

export function email(value: string): boolean {
    return emailRegex.test(value)
}

export function name(value: string): boolean {
    return nameRegex.test(value)
}

export function phoneNr(value: string): boolean {
    return phoneNrRegex.test(value)
}

export function pattern(value: string, regex: RegExp): boolean {
    return regex.test(value)
}

export function pnr(value: string): boolean {
    return getValidNorwegianPersonalNumber(value) != null
}

/**
 * An `http`/`https` URL.
 *
 * Parsing is delegated to `URL` rather than a regex on purpose. The hand-rolled URL regexes this
 * replaces rejected plenty of perfectly valid addresses — ports (`https://x.no:8080`), fragments
 * (`…#section`), internationalised hosts (`https://bærum.no`) and ordinary path characters like
 * `+` or `,` — while a bare `new URL()` check went the other way and accepted `mailto:` and even
 * `foo:bar` as a web address.
 *
 * The explicit protocol check is what makes the rule match its own error message: the copy promises
 * `https://example.com`, so a non-web scheme must not pass.
 */
export function httpUrl(value: string): boolean {
    try {
        const { protocol } = new URL(value.trim())
        return protocol === 'http:' || protocol === 'https:'
    } catch {
        return false
    }
}
