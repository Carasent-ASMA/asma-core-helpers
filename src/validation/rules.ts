import { getValidNorwegianPersonalNumber } from '../helpers/validateNorwegianPersonalNumber.js'

/** Copied from directory/asma-app-directory ActorToUpsertValidator regex helpers — keep pilot behavior identical. */
export const phoneNrRegex = /^\+?\d{6,13}$/
export const emailRegex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/
const NAME_PUNCTUATION = ".,'\u2019\u2013\u2014-"

export const nameRegex = new RegExp(
    `^\\s*\\p{Lu}[\\p{L}${NAME_PUNCTUATION}]*(\\s+\\p{L}[\\p{L}${NAME_PUNCTUATION}]*)*\\s*$`,
    'u',
)

export const nameCharsRegex = new RegExp(`^[\\p{L}\\s${NAME_PUNCTUATION}]*$`, 'u')

export function hasDigit(value: string): boolean {
    return /\d/.test(value)
}

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

export function httpUrl(value: string): boolean {
    try {
        const { protocol } = new URL(value.trim())
        return protocol === 'http:' || protocol === 'https:'
    } catch {
        return false
    }
}
