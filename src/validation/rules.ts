import { getValidNorwegianPersonalNumber } from '../helpers/validateNorwegianPersonalNumber.js'

/** Copied from directory/asma-app-directory ActorToUpsertValidator regex helpers — keep pilot behavior identical. */
export const phoneNrRegex = /^\+?\d{6,13}$/
export const emailRegex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/
/**
 * A person's name: each word starts with a letter (the first with a capital), and letters or hyphens
 * follow.
 *
 * Digits used to be allowed mid-word, which made `Ivan123` a valid name while `123` was rejected —
 * so the only honest message the caller could show for `123` was "start with a capital letter",
 * which reads as nonsense to someone who just typed a number. Rejecting digits outright is what lets
 * the field say "Name cannot contain numbers" and mean it (product decision, 2026-08-18).
 */
export const nameRegex = /^\s*\p{Lu}[\p{L}-]*(\s+\p{L}[\p{L}-]*)*\s*$/u

/** Whether a value carries a digit — the caller's cue to say so instead of blaming the capital. */
export function hasDigit(value: string): boolean {
    return /\d/.test(value)
}

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
