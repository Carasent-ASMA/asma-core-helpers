import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { generateSyntheticPnrWithRetries } from './generateSyntheticNorwegianNumber.js'

const K1_WEIGHTS = [3, 7, 6, 1, 8, 9, 4, 5, 2]
const K2_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

function hasValidControlDigits(pnr: string): boolean {
    const control = (weights: number[]) => {
        const sum = weights.reduce((acc, weight, idx) => acc + weight * Number(pnr.charAt(idx)), 0)
        const remainder = sum % 11
        return remainder === 0 ? 0 : 11 - remainder
    }
    return control(K1_WEIGHTS) === Number(pnr.charAt(9)) && control(K2_WEIGHTS) === Number(pnr.charAt(10))
}

function individualNumberOf(pnr: string): number {
    return Number(pnr.slice(6, 9))
}

const RUNS = 50

describe('generateSyntheticPnrWithRetries', () => {
    it('uses individual numbers 000–499 for births in 1900–1999 (BankID RA century rule)', () => {
        for (let i = 0; i < RUNS; i++) {
            const pnr = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(1998, 7, 12), gender: 'MALE' })
            assert.ok(
                individualNumberOf(pnr) <= 499,
                `individual number ${individualNumberOf(pnr)} of ${pnr} encodes the wrong century for a 1998 birth`,
            )
        }
    })

    it('uses individual numbers 500–999 for births in 2000–2039', () => {
        for (let i = 0; i < RUNS; i++) {
            const pnr = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(2005, 2, 7), gender: 'FEMALE' })
            const individualNumber = individualNumberOf(pnr)
            assert.ok(
                individualNumber >= 500 && individualNumber <= 999,
                `individual number ${individualNumber} of ${pnr} encodes the wrong century for a 2005 birth`,
            )
        }
    })

    it('encodes gender in the individual number parity (even = female, odd = male)', () => {
        for (let i = 0; i < RUNS; i++) {
            const female = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(1992, 7, 11), gender: 'FEMALE' })
            const male = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(1992, 7, 11), gender: 'MALE' })
            assert.equal(individualNumberOf(female) % 2, 0, `female pnr ${female} has an odd individual number`)
            assert.equal(individualNumberOf(male) % 2, 1, `male pnr ${male} has an even individual number`)
        }
    })

    it('marks the number as synthetic by adding 80 to the month by default', () => {
        const pnr = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(1998, 7, 12), gender: 'MALE' })
        assert.equal(pnr.slice(0, 6), '128898')
    })

    it('produces 11 digits with valid mod-11 control digits', () => {
        for (let i = 0; i < RUNS; i++) {
            const pnr = generateSyntheticPnrWithRetries({ dateOfBirth: new Date(1965, 1, 8), gender: 'MALE' })
            assert.match(pnr, /^\d{11}$/)
            assert.ok(hasValidControlDigits(pnr), `control digits of ${pnr} are invalid`)
        }
    })
})
