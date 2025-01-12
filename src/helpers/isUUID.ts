import type { IUUID } from 'asma-types/lib'

const STRICT_UUID_REGEX: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ASMA_UUID_REGEX: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checks if a string is a valid UUID.
 *
 * @param param The string to validate or 'use_strict' to enforce strict validation.
 * @returns A boolean indicating whether the string is a valid UUID.
 *
 * @example
 * isUUID('00000000-0000-0000-0000-000000000000') // true
 * isUUID('use_strict')('00000000-0000-0000-0000-000000000000') // false (strict)
 */
export function isUUID(string?: string): string is IUUID
export function isUUID(mode: 'use_strict'): (string?: string) => string is IUUID
export function isUUID(param?: 'use_strict' | string) {
    if (param === 'use_strict') {
        return (string: string): string is IUUID => assertUUID(string, STRICT_UUID_REGEX)
    }

    return assertUUID(param)
}

function assertUUID(string?: string, UUID_REGEX: RegExp = ASMA_UUID_REGEX): string is IUUID {
    if (typeof string !== 'string') return false
    return UUID_REGEX.test(string)
}
