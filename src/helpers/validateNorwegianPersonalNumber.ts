import { sha256 } from './sha256'

export const NORWEGIAN_PERSONAL_NUMBER = ['REAL', 'DNUMBER', 'SYNTHETIC', 'TEMPORARY'] as const

export type NORWEGIAN_PERSONAL_NUMBER_TYPES = (typeof NORWEGIAN_PERSONAL_NUMBER)[number] | 'INVALID'
export function isNorwegianTemporaryNumber(number: string): boolean {
    return validateNorwegianPersonalNumber(number) === 'TEMPORARY'
}
export function isNorwegianDnumber(number: string): boolean {
    return validateNorwegianPersonalNumber(number) === 'DNUMBER'
}
export function isNorwegianSyntheticNumber(number: string): boolean {
    return validateNorwegianPersonalNumber(number) === 'SYNTHETIC'
}
export function isNorwegianRealNumber(number: string): boolean {
    return validateNorwegianPersonalNumber(number) === 'REAL'
}
export function validateNorwegianPersonalNumberAndGetBirthDate(number: string): {
    class: NORWEGIAN_PERSONAL_NUMBER_TYPES
    birthDate?: string
} {
    // Check if the number has the correct format (11 digits)
    if (!/^\d{11}$/.test(number)) return { class: 'INVALID' }

    /**
     * Convert the string to an array of digits
     * Since the input is guaranteed to be 11 digits, digits will always be a number
     */
    const digits = number.split('').map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
    ]

    // D-number: First digit between 4 and 7
    const isDNumber = digits[0] >= 4 && digits[0] <= 7

    // Synthetic number: First digit of the birth date +40
    const isSynthetic = digits[2] >= 4

    // Temporary number: Last five digits are `11111` or `22222`
    const isTemporary = ['11111', '22222'].includes(number.slice(6))

    let day = digits[0] * 10 + digits[1]
    let month = digits[2] * 10 + digits[3]
    const year = digits[4] * 10 + digits[5]

    const currentYear = new Date().getFullYear()
    const fullYear = year + (year <= currentYear % 100 ? 2000 : 1900) // Adjust year based on the current century

    // Format day and month with leading zero
    const formatWithLeadingZero = (value: number) => value.toString().padStart(2, '0')
    const formattedDay = formatWithLeadingZero(day)
    const formattedMonth = formatWithLeadingZero(month)

    const birthDate = `${formattedDay}.${formattedMonth}.${fullYear}`

    if (isSynthetic) {
        const syntheticMonth = digits[2] * 10 + digits[3]
        const addedNumber = getAddedNumberForSyntheticMonth(syntheticMonth)

        // Invalid synthetic number if no valid month
        if (addedNumber === 'INVALID') {
            return { class: 'INVALID' }
        }

        // Subtract the added number to get the original month and update the birth date to reflect adjusted moth
        month -= addedNumber
        return { class: 'SYNTHETIC', birthDate: `${formattedDay}.${formatWithLeadingZero(month)}.${fullYear}` }
    } else {
        month = digits[2] * 10 + digits[3]
    }

    // Validate control digits (modulus 11)
    const k1Weights = [3, 7, 6, 1, 8, 9, 4, 5, 2]
    const k2Weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

    const calculateControlDigit = (weights: number[], sliceEnd: number): number => {
        const sum = digits.slice(0, sliceEnd).reduce((acc, digit, idx) => acc + digit * weights[idx]!, 0)
        const remainder = sum % 11
        return remainder === 0 ? 0 : 11 - remainder
    }

    const k1 = calculateControlDigit(k1Weights, 9)
    const k2 = calculateControlDigit(k2Weights, 10)

    if (k1 !== digits[9] || k2 !== digits[10]) return { class: 'INVALID' }

    // Identify type based on pattern
    if (isDNumber) {
        day = digits[0] - 4 + digits[1] * 10
        // Update birth date to reflect adjusted day
        return { class: 'DNUMBER', birthDate: `${formatWithLeadingZero(day)}.${formattedMonth}.${fullYear}` }
    }

    /* Important to validate date for Real and Temporary numbers */
    if (!isValidDate(year, month, day)) {
        return { class: 'INVALID' }
    }

    if (isTemporary) {
        return { class: 'TEMPORARY', birthDate }
    }

    return { class: 'REAL', birthDate }
}

export const validateNorwegianPersonalNumber = (number: string) =>
    validateNorwegianPersonalNumberAndGetBirthDate(number).class

/**
 * Extracts the birth date from a Norwegian national ID.
 * @param personalNumber - The Norwegian national ID [Expecting type: `string`].
 * @returns Formatted date string (DD.MM.YYYY) if the ID is valid, or null if the ID is invalid.
 */
export const getBirthDateFromNorwegianPersonalNumber = (number: string) =>
    validateNorwegianPersonalNumberAndGetBirthDate(number).birthDate ?? null

export const getAgeFromNorwegianPersonalNumber = (pnr: string) => {
    const birthday = getBirthDateFromNorwegianPersonalNumber(pnr)

    if (!birthday) {
        return null
    }

    const [day, month, year] = birthday.split('.').map(Number)

    if (!(day && month && year)) {
        return null
    }

    /** Subtract 1 from the month because JavaScript months are zero-based (0-11) */
    const birthDate = new Date(year, month - 1, day)
    const currentDate = new Date()

    let age = currentDate.getFullYear() - birthDate.getFullYear()

    /** Checks if the birthday has already passed this year */
    const isBirthdayThisYearPassed =
        currentDate.getMonth() > birthDate.getMonth() ||
        (currentDate.getMonth() === birthDate.getMonth() && currentDate.getDate() >= birthDate.getDate())

    if (!isBirthdayThisYearPassed) {
        age -= 1
    }

    return age
}

// Function to check for valid date
function isValidDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) return false

    const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= daysInMonth[month - 1]!
}

// Function to check if a year is a leap year
function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Is considered valid synthetic month if `syntheticMonth` is one of these:
 *
 * - **41-52**: `addedValue = 40`
 * - **53-64**: `addedValue = 52`
 * - **65**: `addedValue = 60` (Special case)
 * - **66-77**: `addedValue = 65`
 * - **78-80**: `addedValue = 75` (Special case)
 * - **81-92**: `addedValue = 80`
 */
function getAddedNumberForSyntheticMonth(syntheticMonth: number): number | 'INVALID' {
    if (syntheticMonth === 65) return 60 // Special case for 65

    //special case for synthetic month 78,79,80 to be 75
    if ([78, 79, 80].includes(syntheticMonth)) return 75

    const possibleAdds = [40, 52, 65, 80]

    for (let add of possibleAdds) {
        const calculatedMonth = syntheticMonth - add
        if (calculatedMonth >= 1 && calculatedMonth <= 12) {
            return add // Return the valid added number
        }
    }

    return 'INVALID' // Return INVALID if no valid result found
}

export function generateUniqueToken(user: { fnr: string; salt: string; customer_id?: string; actno?: string }): string {
    const { fnr, salt, actno, customer_id } = user

    if (customer_id && actno && validateNorwegianPersonalNumber(fnr) === 'TEMPORARY') {
        return sha256(`${customer_id}-${fnr}-${actno}`)
    }

    return sha256(`${fnr}${salt}`)
}
