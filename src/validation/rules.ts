import { getValidNorwegianPersonalNumber } from '../helpers/validateNorwegianPersonalNumber.js'

/** Copied from directory/asma-app-directory ActorToUpsertValidator regex helpers — keep pilot behavior identical. */
export const phoneNrRegex = /^\+?\d{6,13}$/
export const emailRegex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/
/**
 * A person's name: each word starts with a letter (the first with a capital), then letters, hyphens,
 * dots, commas or apostrophes — `Kenneth Jul-Larsen`, `Lone Mjørnaren Darum Jr.`, `Bargan, Constantin`.
 *
 * Three things here are load-bearing and easy to "tidy" away:
 * - the comma: the journal stores people as `Lastname, Firstname` and the app composes that shape
 *   itself before an insert, so rejecting it would refuse names the system just wrote;
 * - both apostrophes and all three dashes: editors silently substitute `’`/`–`/`—` for what the
 *   user typed, and the character they see is not the one the rule would reject;
 * - `\p{L}`: it already spans `Æ æ Ø ø Å å` and every other script, so listing Norwegian letters
 *   would only invite someone to treat the list as the definition.
 *
 * Digits are rejected outright so the field can say "Name cannot contain numbers" and mean it —
 * they used to be legal mid-word, which made `Ivan123` valid while `123` was not.
 */
const NAME_PUNCTUATION = ".,'\u2019\u2013\u2014-"

export const nameRegex = new RegExp(
    `^\\s*\\p{Lu}[\\p{L}${NAME_PUNCTUATION}]*(\\s+\\p{L}[\\p{L}${NAME_PUNCTUATION}]*)*\\s*$`,
    'u',
)

/**
 * The characters a name may be built from, ignoring word order and capitalisation.
 *
 * Exists so a caller can tell "there is a character in here that names never contain" (`Vasilii&`)
 * apart from "the letters are fine, the first one is just lower case" (`vasilii`). One regex only
 * answers pass/fail, and a field that answers the wrong question is the trap this rule set keeps
 * falling into. Built from the same `NAME_PUNCTUATION` as `nameRegex`, so the two cannot drift.
 */
export const nameCharsRegex = new RegExp(`^[\\p{L}\\s${NAME_PUNCTUATION}]*$`, 'u')

/** Whether a value carries a digit — the caller's cue to say so instead of blaming the capital. */
export function hasDigit(value: string): boolean {
    return /\d/.test(value)
}

/** Whether every character is one a name may contain. Says nothing about order or capitalisation. */
export function nameChars(value: string): boolean {
    return nameCharsRegex.test(value)
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
