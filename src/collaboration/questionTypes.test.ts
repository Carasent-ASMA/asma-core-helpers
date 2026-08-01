import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    LEGACY_QUESTION_TYPES,
    LEGACY_TO_V2_QUESTION_TYPE,
    type QuestionType,
    QUESTION_TYPES,
    isQuestionType,
    toLegacyQuestionType,
    toV2QuestionType,
} from './questionTypes.js'

/**
 * The register is a contract between two runtimes and a stored hash, so the failure this guards is
 * not "a test is red" but "a question type exists on one side only" — which shows up as a document
 * nobody can render, or a projection that writes a name the legacy wire rejects.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-20-analysis-qnr-template-field-inventory.md:365 — M-062
 */

describe('question type register', () => {
    it('maps every legacy type to a v2 type', () => {
        assert.equal(LEGACY_QUESTION_TYPES.length, 19)

        for (const legacy of LEGACY_QUESTION_TYPES) {
            const mapped = toV2QuestionType(legacy)
            assert.ok(mapped !== undefined, `${legacy} has no v2 mapping`)
            assert.ok(isQuestionType(mapped), `${legacy} maps to ${String(mapped)}, which is not a v2 type`)
        }
    })

    it('round-trips every type in both directions', () => {
        for (const legacy of LEGACY_QUESTION_TYPES) {
            assert.equal(toLegacyQuestionType(LEGACY_TO_V2_QUESTION_TYPE[legacy]), legacy)
        }

        for (const type of QUESTION_TYPES) {
            assert.equal(toV2QuestionType(toLegacyQuestionType(type)), type)
        }
    })

    it('covers the whole v2 union, so no type is reachable only from legacy', () => {
        const reachable = new Set<QuestionType>(Object.values(LEGACY_TO_V2_QUESTION_TYPE))

        assert.equal(QUESTION_TYPES.length, 19)
        assert.deepEqual([...QUESTION_TYPES].sort(), [...reachable].sort())
    })

    it('renames CompositeQuestion and nothing else', () => {
        const renamed = LEGACY_QUESTION_TYPES.filter(
            (legacy) => (LEGACY_TO_V2_QUESTION_TYPE[legacy] as string) !== (legacy as string),
        )

        // The whole backward-compatibility argument rests on this being exactly one entry: 18 types
        // need no translation, so a mapper bug can only ever affect the grid.
        assert.deepEqual(renamed, ['CompositeQuestion'])
        assert.equal(toV2QuestionType('CompositeQuestion'), 'QuestionGrid')
        assert.equal(toLegacyQuestionType('QuestionGrid'), 'CompositeQuestion')
    })

    it('refuses an unknown legacy type instead of passing it through', () => {
        // Passing it through would put a type in the document that no editor can render and no
        // projection can write back; the import mapper has a report to record this in.
        assert.equal(toV2QuestionType('Telepathy'), undefined)
        assert.equal(toV2QuestionType(''), undefined)
        assert.equal(isQuestionType('CompositeQuestion'), false)
    })
})
