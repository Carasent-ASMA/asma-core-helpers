import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    CollaborationError,
    OperationConflictError,
    UnknownOperationError,
    applyOperation,
} from './applyOperation.js'
import type { TemplateOp } from './operations.js'
import { emptyTemplateDocument } from './templateDocument.js'

/**
 * Guards the invariants a consumer would notice if a publish broke them. The exhaustive
 * per-op suite lives with the service that owns the storage; this one exists because this
 * package publishes on every push to master, so the reducer must not be able to ship
 * broken without a red build here first.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:380 (op vocabulary)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 (DOC-LAW-2)
 */

const doc0 = emptyTemplateDocument('tpl-1')

const apply = (ops: TemplateOp[], from = doc0) => ops.reduce((doc, op) => applyOperation(doc, op), from)

const threeQuestions = apply([
    { type: 'question.create', questionId: 'q-1', kind: 'text' },
    { type: 'question.create', questionId: 'q-2', kind: 'text' },
    { type: 'question.create', questionId: 'q-3', kind: 'text', atIndex: 0 },
])

describe('applyOperation', () => {
    it('bumps the revision by one and leaves its input untouched', () => {
        const next = applyOperation(doc0, { type: 'question.create', questionId: 'q-1', kind: 'text' })

        assert.equal(next.revision, 1)
        assert.equal(doc0.revision, 0)
        assert.deepEqual(doc0.questionOrder, [])
    })

    it('inserts at the requested index and clamps one past the end', () => {
        assert.deepEqual(threeQuestions.questionOrder, ['q-3', 'q-1', 'q-2'])

        const clamped = applyOperation(threeQuestions, {
            type: 'question.create',
            questionId: 'q-4',
            kind: 'text',
            atIndex: 99,
        })

        assert.deepEqual(clamped.questionOrder, ['q-3', 'q-1', 'q-2', 'q-4'])
    })

    it('moves by removing first, so the index counts the other questions only', () => {
        const moved = applyOperation(threeQuestions, { type: 'question.move', questionId: 'q-2', toIndex: 0 })

        assert.deepEqual(moved.questionOrder, ['q-2', 'q-3', 'q-1'])
    })

    it('drops the bindings that targeted a deleted question, keeping the shared node', () => {
        const bound = apply([
            { type: 'question.create', questionId: 'q-1', kind: 'text' },
            { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-1',
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
            },
        ])
        assert.ok(bound.mappingBindingsById?.['b-1'])

        const deleted = applyOperation(bound, { type: 'question.delete', questionId: 'q-1' })

        assert.equal(deleted.mappingBindingsById, undefined)
        assert.ok(deleted.mappingNodesById?.['n-1'])
    })

    it('removes a collection that just became empty rather than storing it empty', () => {
        const withAlternative = apply([
            { type: 'question.create', questionId: 'q-1', kind: 'radio' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'Yes' },
        ])
        assert.deepEqual(withAlternative.alternativesById, { 'a-1': { label: 'Yes' } })

        const removed = applyOperation(withAlternative, {
            type: 'alternative.delete',
            questionId: 'q-1',
            alternativeId: 'a-1',
        })

        assert.equal(removed.alternativesById, undefined)
    })

    it('refuses a duplicate create as a conflict', () => {
        const once = applyOperation(doc0, { type: 'question.create', questionId: 'q-1', kind: 'text' })

        assert.throws(
            () => applyOperation(once, { type: 'question.create', questionId: 'q-1', kind: 'text' }),
            (error: unknown) => {
                assert.ok(error instanceof OperationConflictError)
                assert.equal(error.statusCode, 409)
                assert.equal(error.code, 'qnr_operation_conflict')
                return true
            },
        )
    })

    it('reports an unknown op in the shape the service error resolver maps', () => {
        assert.throws(
            () => applyOperation(doc0, { type: 'question.teleport' } as unknown as TemplateOp),
            (error: unknown) => {
                assert.ok(error instanceof UnknownOperationError)
                // bunjs keys the HTTP envelope off this base class, not off CustomError.
                assert.ok(error instanceof CollaborationError)
                assert.equal(error.statusCode, 422)
                assert.equal(error.code, 'qnr_unknown_operation')
                return true
            },
        )
    })
})
