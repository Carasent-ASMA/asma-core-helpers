/**
 * A small seeded PRNG for the deterministic property tests — mulberry32, 32-bit state.
 * No dependency: the point of these tests is reproducibility (same seed ⇒ same document),
 * and a 40-line PRNG does that without pulling fast-check into the published package.
 */
export const mulberry32 = (seed: number): (() => number) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Random integer in [0, max). */
export const intBelow = (random: () => number, max: number): number => Math.floor(random() * max)

/** Random element of a non-empty array. */
export const pick = <T>(random: () => number, items: readonly T[]): T => {
    const item = items[intBelow(random, items.length)]
    if (item === undefined) throw new Error('pick from an empty array')
    return item
}

/** Deep-shuffles a JSON value's object keys using the seed, so key-order invariance is testable. */
export const shuffleKeys = (value: unknown, random: () => number): unknown => {
    if (Array.isArray(value)) return value.map((member) => shuffleKeys(member, random))
    if (typeof value !== 'object' || value === null) return value
    const entries: Array<[string, unknown]> = Object.entries(value as Record<string, unknown>).map(
        ([key, member]) => [key, shuffleKeys(member, random)],
    )
    for (let i = entries.length - 1; i > 0; i--) {
        const j = intBelow(random, i + 1)
        // The indices are in range by construction; noUncheckedIndexedAccess only.
        const tmp = entries[i] as [string, unknown]
        entries[i] = entries[j] as [string, unknown]
        entries[j] = tmp
    }
    return Object.fromEntries(entries)
}
