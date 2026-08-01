import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import { applyOperation, OperationConflictError } from './applyOperation.js'
import { canonicalJson, hashCanonical, reduceToMinimalForm } from './canonicalize.js'
import { findDocLawViolations } from './docLaws.js'
import {
    findDuplicateBindingTargets,
    templateDocumentIsDefault,
    validateTemplateDocument,
} from './schemas.js'
import { emptyTemplateDocument } from './templateDocument.js'
import { generateOpSequence, DOCUMENT_ID } from './testHelpers/documentGenerator.js'
import { mulberry32, shuffleKeys } from './testHelpers/seededRandom.js'

/**
 * TASK-003's property tests: seeded and deterministic — the same seed must reproduce the
 * same documents, so a failure is a diffable artifact, not a flake.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-40-plan-qnr-stage2-new-model-editor-and-sync.md:563 — TASK-003
 */

const applyOnce = (doc: ReturnType<typeof emptyTemplateDocument> | ReturnType<typeof applyOperation>, op: Parameters<typeof applyOperation>[1]): boolean => {
    try {
        applyOperation(doc, op)
        return true
    } catch (error) {
        assert.ok(error instanceof OperationConflictError, 'reducer must fail only with OperationConflictError')
        return false
    }
}

const runSequence = (seed: number, count: number) => {
    let doc = emptyTemplateDocument(DOCUMENT_ID)
    const apply = (op: Parameters<typeof applyOperation>[1]): boolean => {
        try {
            doc = applyOperation(doc, op)
            return true
        } catch (error) {
            assert.ok(error instanceof OperationConflictError, `unexpected failure: ${String(error)}`)
            return false
        }
    }
    const generated = generateOpSequence(seed, count, apply)
    return { doc, generated }
}

describe('applyOperation determinism', () => {
    it('reproduces the identical document from the same seed', () => {
        const first = runSequence(42, 200)
        const second = runSequence(42, 200)
        assert.equal(canonicalJson(reduceToMinimalForm(first.doc, { isDefault: templateDocumentIsDefault })),
            canonicalJson(reduceToMinimalForm(second.doc, { isDefault: templateDocumentIsDefault })))
        // The reducer also applied the same ops (same outcomes, same revision).
        assert.equal(first.doc.revision, second.doc.revision)
    })

    it('different seeds produce different documents', () => {
        const first = runSequence(1, 120)
        const second = runSequence(2, 120)
        assert.notEqual(canonicalJson(first.doc), canonicalJson(second.doc))
    })
})

describe('DOC-LAW invariants under random op sequences', () => {
    for (const seed of [7, 13, 99]) {
        it(`holds for seed ${seed}`, () => {
            const { doc } = runSequence(seed, 150)

            // The reducer can only ever produce DOC-LAW-1-clean documents: every collection it
            // writes is keyed, and every array it writes is primitive ids.
            const liveViolations = findDocLawViolations(doc)
            assert.equal(liveViolations.filter((v) => v.law === 'DOC-LAW-1').length, 0,
                JSON.stringify(liveViolations.slice(0, 3)))

            // The minimal form is fully law-clean: reduction erases the transient empty
            // member records and the spelled-out sentinel defaults.
            const reduced = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
            assert.deepEqual(findDocLawViolations(reduced), [])

            // The reducer's output always validates against the schema…
            const validated = validateTemplateDocument(doc)
            assert.ok(validated.ok, validated.ok ? '' : validated.summary)
            // …and the one-binding-per-target invariant is never violated by construction.
            assert.deepEqual(findDuplicateBindingTargets(doc), [])
        })
    }
})

describe('canonicalization stability', () => {
    const labelDoc = (label: string) => ({
        documentId: 'tpl-nfc',
        revision: 1,
        questionOrder: ['q-1'],
        questionsById: { 'q-1': { type: 'TextShort', label } },
    })

    it('is a fixed point', () => {
        const { doc } = runSequence(21, 100)
        const once = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
        const twice = reduceToMinimalForm(once, { isDefault: templateDocumentIsDefault })
        assert.equal(canonicalJson(once), canonicalJson(twice))
    })

    it('ignores object key order', () => {
        const { doc } = runSequence(21, 100)
        const shuffled = shuffleKeys(doc, mulberry32(1234)) as typeof doc
        assert.equal(
            canonicalJson(reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })),
            canonicalJson(reduceToMinimalForm(shuffled, { isDefault: templateDocumentIsDefault })),
        )
    })

    it('normalises NFC and NFD spellings to the same bytes (§8.2)', () => {
        // 'Måltid' with U+00E5 vs 'a' + U+030A — the contract's own worked example. The
        // canonical serializer NFC-normalises string values, so the bytes MUST agree.
        const composed = labelDoc('Måltid')
        const decomposed = labelDoc('Ma\u030altid')
        assert.equal(canonicalJson(composed), canonicalJson(decomposed))
        assert.equal(
            canonicalJson(reduceToMinimalForm(composed, { isDefault: templateDocumentIsDefault })),
            canonicalJson(reduceToMinimalForm(decomposed, { isDefault: templateDocumentIsDefault })),
        )
    })
})

describe('hash round-trips and golden vectors', () => {
    it('matches the pinned golden hash for a fixed document', async () => {
        // `questionOrder: []` is reduced away (empty collection), so the canonical bytes are
        // exactly `{"documentId":"tpl-golden","revision":0}`.
        const doc = { documentId: 'tpl-golden', revision: 0, questionOrder: [] }
        const hash = await hashCanonical(reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault }))
        assert.equal(hash, 'sha256:fc7cfd897bbf028cae3253422a5a59ad12ea9157678200150cc4391cf08c4e8c')
    })

    it('agrees with node:crypto on the same canonical bytes (WebCrypto ↔ sync)', async () => {
        // The bunjs shim keeps a sync node:crypto hasher over the SAME shared canonical bytes;
        // this pins that the two implementations cannot diverge.
        for (const seed of [3, 11]) {
            const { doc } = runSequence(seed, 60)
            const reduced = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
            const nodeHex = createHash('sha256').update(canonicalJson(reduced), 'utf8').digest('hex')
            assert.equal(await hashCanonical(reduced), `sha256:${nodeHex}`)
        }
    })

    it('round-trips: equal canonical bytes ⇔ equal hash', async () => {
        const { doc } = runSequence(5, 80)
        const shuffled = shuffleKeys(doc, mulberry32(999)) as typeof doc
        const a = canonicalJson(reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault }))
        const b = canonicalJson(reduceToMinimalForm(shuffled, { isDefault: templateDocumentIsDefault }))
        assert.equal(a, b)
        assert.equal(await hashCanonical(a), await hashCanonical(b))
    })
})
