import type { JsonValue } from './canonicalize.js'

/**
 * The two document laws, as an executable check (plan TASK-003).
 *
 * Both are stated in the architecture as prose and enforced at the storage boundary by a CHECK constraint
 * that can only see one of them. `jsonb_strip_nulls(document) = document` catches DOC-LAW-2's explicit
 * `null`, and nothing in the database can catch DOC-LAW-1 at all — an array of objects is perfectly valid
 * jsonb. So the law that matters most for merges is the one with no guard, which is what this file is.
 *
 * ═══ DOC-LAW-1 · NO ARRAYS OF OBJECTS ═══
 * A collection is `<x>ById` plus a primitive order array. The reason is merge behaviour, not taste: JSON
 * Merge Patch (RFC 7386) — the delta format — replaces an array **wholesale**. For an order array of ids
 * that is exactly right, because reordering *is* a whole-array change. For an array of objects it is a
 * silent data loss: two authors editing different members of one array produce two patches, and the second
 * to land discards the first's edit with no conflict raised. Keying the members by id turns that same
 * situation into two patches touching different keys, which merge cleanly.
 *
 * ═══ DOC-LAW-2 · ABSENT IS THE ONLY ENCODING OF "NOT SET" ═══
 * No explicit `null`, no empty object, no empty array, no key carrying its own default. Two encodings of
 * "not set" means two documents that render identically can hash differently — and the hash is what decides
 * whether a version is minted, whether a re-import diverged, and whether two authors actually conflicted.
 *
 * ═══ WHY A LINT AND NOT A TYPE ═══
 * `QnrQuestion` carries an index signature (`[key: string]: unknown`), because a question's per-type
 * configuration bag is genuinely open. That is the right type and it is also why the compiler cannot see
 * either violation: the legacy import writes into exactly that open space. This check found a real one —
 * `dependent_questions` arrives from legacy as an array of objects and was being stored verbatim.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:193 — DOC-LAW-1
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 — DOC-LAW-2
 */

export type DocLawViolation = {
    law: 'DOC-LAW-1' | 'DOC-LAW-2'
    /** Dotted path to the offending node, array members included as numeric segments. */
    path: string
    detail: string
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

const joinPath = (parent: string, key: string) => (parent === '' ? key : `${parent}.${key}`)

/**
 * Every violation in a document, deepest-first is not guaranteed — order follows traversal.
 *
 * `revision` is exempt from DOC-LAW-2's default rule: it is `0` on a fresh document and `0` is its
 * meaningful value there, not an omittable default. Nothing else is exempt.
 */
export const findDocLawViolations = (document: unknown): DocLawViolation[] => {
    const violations: DocLawViolation[] = []

    const walk = (value: unknown, path: string): void => {
        if (value === null) {
            violations.push({ law: 'DOC-LAW-2', path, detail: 'explicit null; omit the key instead' })
            return
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                violations.push({ law: 'DOC-LAW-2', path, detail: 'empty array; omit the key instead' })
                return
            }

            value.forEach((member, index) => {
                const memberPath = joinPath(path, String(index))
                if (isPlainObject(member) || Array.isArray(member)) {
                    violations.push({
                        law: 'DOC-LAW-1',
                        path: memberPath,
                        detail: `array member is ${Array.isArray(member) ? 'an array' : 'an object'}; use <x>ById plus a primitive order array`,
                    })
                }
                walk(member, memberPath)
            })
            return
        }

        if (isPlainObject(value)) {
            const keys = Object.keys(value)
            if (keys.length === 0 && path !== '') {
                violations.push({ law: 'DOC-LAW-2', path, detail: 'empty object; omit the key instead' })
                return
            }
            for (const key of keys) walk(value[key], joinPath(path, key))
        }
    }

    walk(document, '')
    return violations
}

/**
 * Rewrites a legacy array-of-objects into the DOC-LAW-1 shape, in place of the array.
 *
 * `{ <field>: [ {...}, {...} ] }` becomes `{ <field>ById: { <id>: {...} }, <field>Order: [ <id>, … ] }`,
 * with ids derived by the caller so they are stable across revisions — a random id would make every
 * re-import look like an edit, which is the same trap `derivedAlternativeId` exists to avoid.
 */
export const toKeyedCollection = <T>(
    members: readonly T[],
    idOf: (member: T, index: number) => string,
): { byId: Record<string, T>; order: string[] } => {
    const byId: Record<string, T> = {}
    const order: string[] = []

    members.forEach((member, index) => {
        const id = idOf(member, index)
        byId[id] = member
        order.push(id)
    })

    return { byId, order }
}

/** True when the value is an array carrying at least one object or array member. */
export const isArrayOfContainers = (value: unknown): value is JsonValue[] =>
    Array.isArray(value) && value.some((member) => isPlainObject(member) || Array.isArray(member))
