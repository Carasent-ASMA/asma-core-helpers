import type { GENDER } from './validateNorwegianPersonalNumber'

function generateSyntheticPnr({
    dateOfBirth,
    gender,
    factor = 80,
}: {
    dateOfBirth: Date
    gender: GENDER
    factor?: 40 | 52 | 65 | 80
}) {
    const day = dateOfBirth.getDate().toString().padStart(2, '0')
    const month = (dateOfBirth.getMonth() + 1 + factor).toString().padStart(2, '0') // Add 40 to the month

    const year = dateOfBirth.getFullYear().toString().slice(-2)

    // Generate individual numbers
    let individualNumber: number
    if (gender === 'FEMALE') {
        individualNumber = 0
    } else {
        individualNumber = 1
    }
    console.log({ individualNumber })
    // Adjust individual number into a realistic range for randomness
    individualNumber = 500 + Math.floor(Math.random() * 250) * 2 + individualNumber // Ensures gender parity

    const individualNumberString = individualNumber.toString().padStart(3, '0')
    const basicNumber = `${day}${month}${year}${individualNumberString}`
    console.log({ individualNumber, basicNumber, individualNumberString })
    // Calculate control numbers
    const control1 =
        (11 -
            ((3 * parseInt(basicNumber[0]!) +
                7 * parseInt(basicNumber[1]!) +
                6 * parseInt(basicNumber[2]!) +
                1 * parseInt(basicNumber[3]!) +
                8 * parseInt(basicNumber[4]!) +
                9 * parseInt(basicNumber[5]!) +
                4 * parseInt(basicNumber[6]!) +
                5 * parseInt(basicNumber[7]!) +
                2 * parseInt(basicNumber[8]!)) %
                11)) %
        11

    const control2 =
        (11 -
            ((5 * parseInt(basicNumber[0]!) +
                4 * parseInt(basicNumber[1]!) +
                3 * parseInt(basicNumber[2]!) +
                2 * parseInt(basicNumber[3]!) +
                7 * parseInt(basicNumber[4]!) +
                6 * parseInt(basicNumber[5]!) +
                5 * parseInt(basicNumber[6]!) +
                4 * parseInt(basicNumber[7]!) +
                3 * parseInt(basicNumber[8]!) +
                2 * control1) %
                11)) %
        11

    if (control1 === 10 || control2 === 10) {
        // Control digits cannot be 10
        return 'INVALID'
    }
    const personNumber = `${basicNumber}${control1}${control2}`
    if (personNumber.length !== 11) {
        return 'INVALID'
    }
    return personNumber
}
/**
 *
 * This method is added on top of generateNorwegianPersonNumber because generated random gender equality number is not guaranteed.
 * In case when generated number is invalid, this method will retry to generate a new number until a valid one is found.
 *
 * @returns valid synthetic Norwegian personal number or 'INVALID' if the number is invalid
 */
export function generateSyntheticPnrWithRetries(data: {
    dateOfBirth: Date
    gender: GENDER
    factor?: 40 | 52 | 65 | 80
}) {
    while (true) {
        const pnr = generateSyntheticPnr(data)

        if (pnr !== 'INVALID') {
            return pnr
        }
    }
}
