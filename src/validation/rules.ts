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
