export const NORWEGIAN_PERSONAL_NUMBER = ['REAL', 'DNUMBER', 'SYNTHETIC', 'TEMPORARY'] as const

export type NORWEGIAN_PERSONAL_NUMBER_TYPES = (typeof NORWEGIAN_PERSONAL_NUMBER)[number] | 'INVALID'

export function validateNorwegianPersonalNumber(number: string): NORWEGIAN_PERSONAL_NUMBER_TYPES {
    // Check if the number has the correct format (11 digits)
    if (!/^\d{11}$/.test(number)) return 'INVALID'

    // Convert the string to an array of digits
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

    // Since the input is guaranteed to be 11 digits, digits[0] will always be a number
    // No need to check the type of digits[0] again

    // D-number: First digit between 4 and 7
    const isDNumber = digits[0] >= 4 && digits[0] <= 7

    // Synthetic number: First digit of the birth date +40
    const isSynthetic = digits[2] >= 4

    // Check for temporary number: Last 5 digits are 11111 or 22222

    // Validate birth date or D-number date or temporary number
    const day = isDNumber ? digits[0] - 4 + digits[1] * 10 : digits[0] * 10 + digits[1]
    const month = isSynthetic ? digits[2] - 4 + digits[3] * 10 : digits[2] * 10 + digits[3]
    const year = parseInt(digits[4] <= 4 ? `19${digits[4]}${digits[5]}` : `20${digits[4]}${digits[5]}`, 10)

    if (!isValidDate(year, month, day)) return 'INVALID'

    const lastFiveDigits = number.slice(6)

    if (lastFiveDigits === '11111' || lastFiveDigits === '22222') return 'TEMPORARY'

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

    if (k1 !== digits[9] || k2 !== digits[10]) return 'INVALID'

    // Identify type based on pattern
    if (isDNumber) return 'DNUMBER'
    if (isSynthetic) return 'SYNTHETIC'
    return 'REAL'
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
