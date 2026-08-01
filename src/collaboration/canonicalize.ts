/**
 * Canonical form for hashed documents.
 *
 * Two separable steps, because two consumers need different amounts of it:
 *
 * 1. `reduceToMinimalForm` — DOC-LAW-2: absent is the only encoding of "not set".
 * 2. `canonicalJson` — RFC 8785 (JCS): sorted members, no whitespace, ECMAScript
 *    numbers, plus NFC normalisation, which JCS deliberately leaves out.
 *
 * The template/answer documents reduce their whole body; the data engine's
 * `structureHash` reduces only four members of the structure document and then runs
 * the identical serialiser — same bytes, different selection.
 *
 * This is the single shared implementation: the frontend, bunjs and the data engine
 * all produce the same bytes from here. `hashCanonical` is the one function that needs
 * a platform primitive (SHA-256), so it takes an injectable hasher with a WebCrypto
 * default that works in browsers, Node 18+ and Bun alike.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 (DOC-LAW-2)
 * @see asma-modules/_docs/qnr-data-engine/specs/2026-07-30-00-11-spec-qnr-data-engine-contract.md:652 (§8.2)
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** Returns true when `value` at `path` equals the schema default and must be omitted. */
export type IsDefault = (path: string, value: unknown) => boolean

export type ReduceOptions = {
    isDefault?: IsDefault
}

/**
 * A prototype check, not a `typeof` check. `typeof new Date() === 'object'` and a Date
 * has no own enumerable keys, so a `typeof` test would serialise it as `{}` — silently
 * erasing a timestamp from a hashed document.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

const joinPath = (parent: string, key: string) => (parent === '' ? key : `${parent}.${key}`)

/**
 * DOC-LAW-2 reduction. Drops explicit `null`, `[]`, `{}` and any key carrying its own
 * default — recursively, so a container that becomes empty is itself dropped and the
 * result is a fixed point (reducing twice is a no-op).
 *
 * The root container is always returned, even if it reduces to empty: a caller asking
 * to canonicalize a document wants a document back, not `undefined`.
 */
export const reduceToMinimalForm = <T>(value: T, options: ReduceOptions = {}): T => {
    const reduced = reduceNode(value, '', options)
    if (reduced !== undefined) return reduced as T
    return (Array.isArray(value) ? [] : {}) as T
}

const reduceNode = (value: unknown, path: string, options: ReduceOptions): unknown => {
    if (value === null) return undefined

    if (Array.isArray(value)) {
        // ponytail: array members are reduced but never removed. Dropping one would
        // silently change length and order, and order is the only ordering carrier
        // (DOC-LAW-1) — a null member is a schema violation for the lint to catch,
        // not something to paper over here.
        let anyMemberSurvived = false

        const members = value.map((member, index) => {
            const reducedMember = reduceNode(member, joinPath(path, String(index)), options)
            if (reducedMember !== undefined) {
                anyMemberSurvived = true
                return reducedMember
            }

            // A container member that reduces away becomes the EMPTY container, not the original.
            // Restoring the original would put back the very nulls this reduction exists to remove, and
            // the storage guard `document = jsonb_strip_nulls(document)` then rejects the row — which is
            // exactly how this was found, on the first real import against dev. A primitive `null` member
            // is kept: `jsonb_strip_nulls` removes null object *fields* only, so an array null is legal,
            // and dropping it would change the length this branch is protecting.
            if (Array.isArray(member)) return []
            if (isPlainObject(member)) return {}
            return member
        })

        if (members.length === 0) return undefined

        // An array in which NOTHING survived reduction carries no information, so the key goes — same rule
        // as an empty object, reached one level later. Length is not worth protecting here because there is
        // no content whose position it could describe.
        //
        // Measured, and the reason this branch exists: legacy `dependent_questions` members hold exactly
        // `{dependent_question_id, dependent_composite_question_id}` and **all 3,702 members sampled on dev
        // have both fields null**. Without this rule the port stored 620 arrays of `{}` per version —
        // simultaneously a DOC-LAW-1 violation (array of objects) and a DOC-LAW-2 one (empty object), and
        // invisible to the storage CHECK because `jsonb_strip_nulls` does not remove empty objects.
        //
        // A MIXED array — some members surviving, some not — is deliberately still kept with its empties, so
        // the surviving members keep their positions. That case is left for `findDocLawViolations` to report
        // rather than papered over here, because papering over it would move a real content position.
        if (!anyMemberSurvived) return undefined

        return members
    }

    if (isPlainObject(value)) {
        const result: Record<string, unknown> = {}
        for (const [key, member] of Object.entries(value)) {
            const memberPath = joinPath(path, key)
            if (options.isDefault?.(memberPath, member)) continue
            const reducedMember = reduceNode(member, memberPath, options)
            if (reducedMember === undefined) continue
            result[key] = reducedMember
        }
        return Object.keys(result).length === 0 ? undefined : result
    }

    return value
}

/**
 * RFC 8785 JSON Canonicalization Scheme over the value, plus NFC.
 *
 * Refuses anything JSON cannot carry rather than emitting a lossy encoding — an
 * `undefined` silently vanishing from a hashed document is exactly the class of bug
 * a canonical form exists to prevent.
 */
export const canonicalJson = (value: unknown): string => serialize(value, '')

const serialize = (value: unknown, path: string): string => {
    if (value === null) return 'null'

    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false'
        case 'string':
            // JSON.stringify already produces ECMAScript-minimal escaping, which is
            // what JCS mandates.
            return JSON.stringify(value.normalize('NFC'))
        case 'number':
            if (!Number.isFinite(value)) {
                throw new Error(`canonicalJson: ${value} is not finite at "${path || '<root>'}"`)
            }
            // JSON.stringify uses Number::toString, which is JCS's number rule.
            return JSON.stringify(value)
        case 'undefined':
            throw new Error(`canonicalJson: undefined at "${path || '<root>'}"`)
        case 'bigint':
            throw new Error(`canonicalJson: bigint is unsupported at "${path || '<root>'}"`)
        case 'function':
        case 'symbol':
            throw new Error(`canonicalJson: ${typeof value} is unsupported at "${path || '<root>'}"`)
    }

    if (Array.isArray(value)) {
        return `[${value.map((member, index) => serialize(member, joinPath(path, String(index)))).join(',')}]`
    }

    if (!isPlainObject(value)) {
        const name = Object.prototype.toString.call(value).slice(8, -1)
        throw new Error(`canonicalJson: ${name} is unsupported at "${path || '<root>'}"`)
    }

    // Normalise before sorting: normalisation can change the code units that sorting
    // compares, so the other order would not be stable.
    const members = new Map<string, unknown>()
    for (const [key, member] of Object.entries(value)) {
        const normalized = key.normalize('NFC')
        if (members.has(normalized)) {
            throw new Error(`canonicalJson: keys "${key}" and its NFC twin collide at "${path || '<root>'}"`)
        }
        members.set(normalized, member)
    }

    const body = [...members.keys()]
        .sort() // default comparison is by UTF-16 code unit, which is JCS's rule
        .map((key) => `${JSON.stringify(key)}:${serialize(members.get(key), joinPath(path, key))}`)
        .join(',')

    return `{${body}}`
}

/** `sha256:<lowercase hex>` over the canonical bytes of the value. */
export type Sha256Hex = (utf8: string) => string | Promise<string>

const bytesToHex = (bytes: Uint8Array): string =>
    [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * WebCrypto SHA-256 — the default hasher. Present in browsers, Node 18+ and Bun as
 * `globalThis.crypto`, so one implementation serves every consumer of this package.
 * A server-side consumer with a sync hot path may inject its own hasher instead.
 */
export const webCryptoSha256: Sha256Hex = async (utf8) => {
    const bytes = new TextEncoder().encode(utf8)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return bytesToHex(new Uint8Array(digest))
}

/**
 * Canonical hash of a document: `sha256:` over RFC 8785 + NFC bytes of its minimal
 * form. `hasher` is injectable so a server can use sync node:crypto while the browser
 * keeps the WebCrypto default — the bytes hashed are identical either way.
 */
export const hashCanonical = (value: unknown, hasher: Sha256Hex = webCryptoSha256): Promise<string> =>
    hasher(canonicalJson(value)).then((hex) => `sha256:${hex}`)
