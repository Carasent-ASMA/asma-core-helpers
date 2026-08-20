import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    CollaborationError,
    OperationConflictError,
    UnknownOperationError,
    applyOperation,
} from './applyOperation.js'
import type { TemplateOp } from './operations.js'
import { emptyTemplateDocument, type QnrTemplateDocument } from './templateDocument.js'

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
    { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
    { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
    { type: 'question.create', questionId: 'q-3', questionType: 'TextShort', atIndex: 0 },
])

describe('applyOperation', () => {
    it('bumps the revision by one and leaves its input untouched', () => {
        const next = applyOperation(doc0, { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' })

        assert.equal(next.revision, 1)
        assert.equal(doc0.revision, 0)
        assert.deepEqual(doc0.questionOrder, [])
    })

    it('inserts at the requested index and clamps one past the end', () => {
        assert.deepEqual(threeQuestions.questionOrder, ['q-3', 'q-1', 'q-2'])

        const clamped = applyOperation(threeQuestions, {
            type: 'question.create',
            questionId: 'q-4',
            questionType: 'TextShort',
            atIndex: 99,
        })

        assert.deepEqual(clamped.questionOrder, ['q-3', 'q-1', 'q-2', 'q-4'])
    })

    it('moves by removing first, so the index counts the other questions only', () => {
        const moved = applyOperation(threeQuestions, { type: 'question.move', questionId: 'q-2', toIndex: 0 })

        assert.deepEqual(moved.questionOrder, ['q-2', 'q-3', 'q-1'])
    })

    it('creates an ordered grid-owned column without adding it to the top-level order', () => {
        const grid = apply([{ type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' }])

        const withColumns = apply(
            [
                {
                    type: 'gridColumn.create',
                    questionId: 'g-1',
                    columnQuestionId: 'c-1',
                    questionType: 'TextShort',
                },
                {
                    type: 'gridColumn.create',
                    questionId: 'g-1',
                    columnQuestionId: 'c-2',
                    questionType: 'DateField',
                    atIndex: 0,
                },
            ],
            grid,
        )

        assert.deepEqual(withColumns.questionOrder, ['g-1'])
        assert.deepEqual(withColumns.questionsById?.['g-1']?.grid?.columnIds, ['c-2', 'c-1'])
        assert.deepEqual(withColumns.questionsById?.['c-1'], { type: 'TextShort' })
        assert.deepEqual(withColumns.questionsById?.['c-2'], { type: 'DateField' })
    })

    it('refuses every grid-column operation through a non-grid question', () => {
        const ordinary = apply([{ type: 'question.create', questionId: 'q-1', questionType: 'TextShort' }])

        assert.throws(
            () =>
                applyOperation(ordinary, {
                    type: 'gridColumn.create',
                    questionId: 'q-1',
                    columnQuestionId: 'c-1',
                    questionType: 'TextShort',
                }),
            OperationConflictError,
        )

        const malformed = {
            ...ordinary,
            questionsById: {
                'q-1': { type: 'TextShort', grid: { columnIds: ['c-1'] } },
                'c-1': { type: 'TextShort' },
            },
        } satisfies QnrTemplateDocument

        assert.throws(
            () =>
                applyOperation(malformed, {
                    type: 'gridColumn.move',
                    questionId: 'q-1',
                    columnQuestionId: 'c-1',
                    toIndex: 0,
                }),
            OperationConflictError,
        )
        assert.throws(
            () =>
                applyOperation(malformed, {
                    type: 'gridColumn.setLayout',
                    questionId: 'q-1',
                    columnQuestionId: 'c-1',
                    placement: { row: 0, cell: 0 },
                }),
            OperationConflictError,
        )
    })

    it('moves a column only inside its grid and refuses to inject it into the top-level order', () => {
        const withColumns = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            {
                type: 'gridColumn.create',
                questionId: 'g-1',
                columnQuestionId: 'c-1',
                questionType: 'TextShort',
            },
            {
                type: 'gridColumn.create',
                questionId: 'g-1',
                columnQuestionId: 'c-2',
                questionType: 'DateField',
            },
        ])

        const moved = applyOperation(withColumns, {
            type: 'gridColumn.move',
            questionId: 'g-1',
            columnQuestionId: 'c-1',
            toIndex: 1,
        })

        assert.deepEqual(moved.questionsById?.['g-1']?.grid?.columnIds, ['c-2', 'c-1'])
        assert.deepEqual(moved.questionOrder, ['g-1'])
        assert.throws(
            () => applyOperation(moved, { type: 'question.move', questionId: 'c-1', toIndex: 0 }),
            OperationConflictError,
        )
    })

    it('sets and clears a grid column layout as one atomic placement', () => {
        const withColumn = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            {
                type: 'gridColumn.create',
                questionId: 'g-1',
                columnQuestionId: 'c-1',
                questionType: 'TextShort',
            },
        ])

        const placed = applyOperation(withColumn, {
            type: 'gridColumn.setLayout',
            questionId: 'g-1',
            columnQuestionId: 'c-1',
            placement: { row: 2, cell: 1, keepCellSize: true },
        })

        assert.deepEqual(placed.questionsById?.['g-1']?.presentation?.rowEditor, {
            layoutByQuestionId: { 'c-1': { row: 2, cell: 1, keepCellSize: true } },
        })

        const cleared = applyOperation(placed, {
            type: 'gridColumn.setLayout',
            questionId: 'g-1',
            columnQuestionId: 'c-1',
            placement: null,
        })

        assert.equal(cleared.questionsById?.['g-1']?.presentation, undefined)
    })

    it('deletes a column from grid cells and every convention-named presentation map', () => {
        const withColumns = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            {
                type: 'gridColumn.create',
                questionId: 'g-1',
                columnQuestionId: 'c-1',
                questionType: 'TextShort',
            },
            {
                type: 'gridColumn.create',
                questionId: 'g-1',
                columnQuestionId: 'c-2',
                questionType: 'TextShort',
            },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-1' },
            { type: 'gridRow.updateCell', questionId: 'g-1', rowId: 'r-1', columnQuestionId: 'c-1', value: 'one' },
            { type: 'gridRow.updateCell', questionId: 'g-1', rowId: 'r-1', columnQuestionId: 'c-2', value: 'two' },
        ])
        const authored = {
            ...withColumns,
            questionsById: {
                ...withColumns.questionsById,
                'g-1': {
                    ...withColumns.questionsById?.['g-1'],
                    presentation: {
                        rowEditor: {
                            layoutByQuestionId: {
                                'c-1': { row: 0, cell: 0 },
                                'c-2': { row: 0, cell: 1 },
                            },
                        },
                        defaultColumnWidthsByQuestionId: { 'c-1': 120, 'c-2': 160 },
                        soloByQuestionId: { 'c-1': 'remove-the-empty-map' },
                        toolbar: {
                            labelsByQuestionId: { 'c-1': 'First', 'c-2': 'Second' },
                            theme: 'compact',
                        },
                    },
                },
            },
        }

        const deleted = applyOperation(authored, { type: 'question.delete', questionId: 'c-1' })
        const presentation = deleted.questionsById?.['g-1']?.presentation

        assert.deepEqual(deleted.questionsById?.['g-1']?.grid?.columnIds, ['c-2'])
        assert.deepEqual(deleted.gridRowsById?.['r-1']?.cells, { 'c-2': 'two' })
        assert.deepEqual(presentation?.rowEditor?.layoutByQuestionId, { 'c-2': { row: 0, cell: 1 } })
        assert.deepEqual(presentation?.defaultColumnWidthsByQuestionId, { 'c-2': 160 })
        assert.equal(presentation?.soloByQuestionId, undefined)
        assert.deepEqual(presentation?.toolbar, {
            labelsByQuestionId: { 'c-2': 'Second' },
            theme: 'compact',
        })
    })

    it('drops the bindings that targeted a deleted question, keeping the shared node', () => {
        const bound = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
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
            { type: 'question.create', questionId: 'q-1', questionType: 'RadioButtons' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'Yes' },
        ])
        assert.deepEqual(withAlternative.alternativesById, { 'a-1': { label: 'Yes' } })

        const removed = applyOperation(withAlternative, {
            type: 'alternative.delete',
            questionId: 'q-1',
            alternativeId: 'a-1',
        })

        assert.equal(removed.alternativesById, undefined)
        // …and the question's order key goes with it — DOC-LAW-2 stores no empty array.
        assert.equal(removed.alternativeOrderByQuestionId, undefined)
    })

    it('writes a nested per-type field through a dotted path', () => {
        // The per-type configuration is nested in the document (`question.scale.{from, to}`) while an
        // op value is a scalar, so without path support a LinearScale's own settings cannot be
        // authored at all.
        const created = apply([{ type: 'question.create', questionId: 'q-1', questionType: 'LinearScale' }])

        const configured = apply(
            [
                { type: 'question.updateField', questionId: 'q-1', field: 'scale.from', value: 1 },
                { type: 'question.updateField', questionId: 'q-1', field: 'scale.toLabel', value: 'Svært godt' },
            ],
            created,
        )

        assert.deepEqual(configured.questionsById?.['q-1'], {
            type: 'LinearScale',
            scale: { from: 1, toLabel: 'Svært godt' },
        })
    })

    it('removes the nested group when its last key is unset, never storing it empty', () => {
        // DOC-LAW-2: an empty collection is not stored. Leaving `{ scale: {} }` behind would change
        // `document_hash` for a document that carries no scale at all, so two clients that took
        // different routes to the same state would disagree about the hash.
        const configured = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'LinearScale' },
            { type: 'question.updateField', questionId: 'q-1', field: 'scale.from', value: 1 },
        ])

        const cleared = applyOperation(configured, {
            type: 'question.updateField',
            questionId: 'q-1',
            field: 'scale.from',
            value: null,
        })

        assert.deepEqual(cleared.questionsById?.['q-1'], { type: 'LinearScale' })
    })

    it('keeps sibling keys when one nested key is unset', () => {
        const configured = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'LinearScale' },
            { type: 'question.updateField', questionId: 'q-1', field: 'scale.from', value: 1 },
            { type: 'question.updateField', questionId: 'q-1', field: 'scale.to', value: 10 },
        ])

        const cleared = applyOperation(configured, {
            type: 'question.updateField',
            questionId: 'q-1',
            field: 'scale.from',
            value: null,
        })

        assert.deepEqual(cleared.questionsById?.['q-1'], { type: 'LinearScale', scale: { to: 10 } })
    })

    it('does not mutate the document a nested write was derived from', () => {
        // The store keeps the confirmed base and replays pending ops onto it, so a nested write that
        // reached into the previous object would corrupt the base and make the replay non-repeatable.
        const before = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'LinearScale' },
            { type: 'question.updateField', questionId: 'q-1', field: 'scale.from', value: 1 },
        ])

        applyOperation(before, { type: 'question.updateField', questionId: 'q-1', field: 'scale.to', value: 10 })

        assert.deepEqual(before.questionsById?.['q-1'], { type: 'LinearScale', scale: { from: 1 } })
    })

    it('renames an alternative in place, keeping the id every answer references', () => {
        // The whole reason this op exists rather than delete-then-create: an answer stores the
        // alternative id, so a rename that mints a new id orphans every answer that chose it.
        const created = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'RadioButtons' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'Ja' },
        ])

        const renamed = applyOperation(created, {
            type: 'alternative.updateField',
            questionId: 'q-1',
            alternativeId: 'a-1',
            field: 'label',
            value: 'Ja, alltid',
        })

        assert.deepEqual(renamed.alternativesById, { 'a-1': { label: 'Ja, alltid' } })
        assert.deepEqual(renamed.alternativeOrderByQuestionId, { 'q-1': ['a-1'] })
    })

    it('reorders alternatives without touching their values', () => {
        const created = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'CheckBoxes' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'En' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-2', label: 'To' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-3', label: 'Tre' },
        ])

        const moved = applyOperation(created, {
            type: 'alternative.move',
            questionId: 'q-1',
            alternativeId: 'a-3',
            toIndex: 0,
        })

        assert.deepEqual(moved.alternativeOrderByQuestionId?.['q-1'], ['a-3', 'a-1', 'a-2'])
        assert.deepEqual(moved.alternativesById, created.alternativesById)
    })

    it('refuses to edit or move an alternative through the wrong question', () => {
        // An id that exists but hangs off another question means the clients disagree about
        // structure; writing the value anyway would report success and diverge the documents.
        const created = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'RadioButtons' },
            { type: 'question.create', questionId: 'q-2', questionType: 'RadioButtons' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'Ja' },
        ])

        assert.throws(
            () =>
                applyOperation(created, {
                    type: 'alternative.updateField',
                    questionId: 'q-2',
                    alternativeId: 'a-1',
                    field: 'label',
                    value: 'Nei',
                }),
            OperationConflictError,
        )

        assert.throws(
            () => applyOperation(created, { type: 'alternative.move', questionId: 'q-2', alternativeId: 'a-1', toIndex: 0 }),
            OperationConflictError,
        )
    })

    it('refuses to edit an alternative that does not exist', () => {
        const created = apply([{ type: 'question.create', questionId: 'q-1', questionType: 'RadioButtons' }])

        assert.throws(
            () =>
                applyOperation(created, {
                    type: 'alternative.updateField',
                    questionId: 'q-1',
                    alternativeId: 'ghost',
                    field: 'label',
                    value: 'Ja',
                }),
            OperationConflictError,
        )
    })

    it('refuses a duplicate create as a conflict', () => {
        const once = applyOperation(doc0, { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' })

        assert.throws(
            () => applyOperation(once, { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' }),
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

    it('drops a deleted question\'s own rule records along with its order entries', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'visibilityRule.set', ruleId: 'vr-1', questionId: 'q-1', condition: { sourceQuestionId: 'q-2', value: 'x' } },
            { type: 'highlightRule.set', ruleId: 'hr-1', questionId: 'q-1', condition: { sourceQuestionId: 'q-2', value: 'y' } },
            { type: 'narrativeRule.set', ruleId: 'nr-1', questionId: 'q-1', condition: { sourceQuestionId: 'q-2' } },
            {
                type: 'qnrRule.set',
                ruleId: 'qr-1',
                questionId: 'q-1',
                condition: { sourceQuestionId: 'q-1' },
                templateFamilyId: 'family-1',
            },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'q-1' })

        assert.equal(deleted.visibilityRulesById, undefined)
        assert.equal(deleted.visibilityRuleOrderByQuestionId, undefined)
        assert.equal(deleted.highlightRulesById, undefined)
        assert.equal(deleted.highlightRuleOrderByQuestionId, undefined)
        assert.equal(deleted.narrativeRulesById, undefined)
        assert.equal(deleted.narrativeRuleOrderByQuestionId, undefined)
        assert.equal(deleted.qnrRulesById, undefined)
        assert.equal(deleted.qnrRuleOrderByQuestionId, undefined)
    })

    it('stores narrative and qnr rules in root collections with per-question primitive order', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'narrativeRule.set', ruleId: 'nr-1', questionId: 'q-1', condition: { sourceQuestionId: 'q-2' } },
            {
                type: 'qnrRule.set',
                ruleId: 'qr-1',
                questionId: 'q-1',
                condition: { sourceQuestionId: 'q-1', value: 'yes' },
                templateFamilyId: 'family-1',
            },
        ])

        assert.deepEqual(doc.narrativeRulesById, {
            'nr-1': { condition: { sourceQuestionId: 'q-2' } },
        })
        assert.deepEqual(doc.narrativeRuleOrderByQuestionId, { 'q-1': ['nr-1'] })
        assert.deepEqual(doc.qnrRulesById, {
            'qr-1': {
                condition: { sourceQuestionId: 'q-1', value: 'yes' },
                templateFamilyId: 'family-1',
            },
        })
        assert.deepEqual(doc.qnrRuleOrderByQuestionId, { 'q-1': ['qr-1'] })

        const withoutNarrative = applyOperation(doc, { type: 'narrativeRule.delete', ruleId: 'nr-1' })
        const withoutEither = applyOperation(withoutNarrative, { type: 'qnrRule.delete', ruleId: 'qr-1' })
        assert.equal(withoutEither.narrativeRulesById, undefined)
        assert.equal(withoutEither.narrativeRuleOrderByQuestionId, undefined)
        assert.equal(withoutEither.qnrRulesById, undefined)
        assert.equal(withoutEither.qnrRuleOrderByQuestionId, undefined)
    })

    it('keeps another question\'s rule that references the deleted question, for validation to surface', () => {
        // Dropping the surviving question's authored rule silently would be data loss; the
        // dangling sourceQuestionId is a validation finding, not a reducer decision.
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'visibilityRule.set', ruleId: 'vr-1', questionId: 'q-2', condition: { sourceQuestionId: 'q-1' } },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'q-1' })

        assert.deepEqual(deleted.visibilityRuleOrderByQuestionId, { 'q-2': ['vr-1'] })
        assert.ok(deleted.visibilityRulesById?.['vr-1'])
    })

    it('rejects a binding update that would put two bindings on one target', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-1',
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
            },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-2',
                nodeId: 'n-1',
                fieldId: 'Adresse',
                target: { kind: 'question', questionId: 'q-2' },
            },
        ])

        assert.throws(
            () =>
                applyOperation(doc, {
                    type: 'mappingBinding.update',
                    bindingId: 'b-2',
                    patch: { target: { kind: 'question', questionId: 'q-1' } },
                }),
            OperationConflictError,
        )
    })

    it('moves a rule instead of listing it under two questions when it is set again elsewhere', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'visibilityRule.set', ruleId: 'vr-1', questionId: 'q-1', condition: { sourceQuestionId: 'q-2' } },
        ])

        const moved = applyOperation(doc, {
            type: 'visibilityRule.set',
            ruleId: 'vr-1',
            questionId: 'q-2',
            condition: { sourceQuestionId: 'q-1' },
        })

        assert.equal(moved.visibilityRuleOrderByQuestionId?.['q-1'], undefined)
        assert.deepEqual(moved.visibilityRuleOrderByQuestionId?.['q-2'], ['vr-1'])
        assert.deepEqual(Object.keys(moved.visibilityRulesById ?? {}), ['vr-1'])
    })

    it('refuses to set a rule on a question that does not exist', () => {
        const doc = apply([{ type: 'question.create', questionId: 'q-1', questionType: 'TextShort' }])

        assert.throws(
            () =>
                applyOperation(doc, {
                    type: 'visibilityRule.set',
                    ruleId: 'vr-1',
                    questionId: 'ghost',
                    condition: { sourceQuestionId: 'q-1' },
                }),
            OperationConflictError,
        )
    })

    it('refuses to delete or edit a grid row through the wrong grid', () => {
        // Same divergence rule as alternatives: a row id that exists but hangs off another
        // grid means the two clients disagree about the structure, not just the value.
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'question.create', questionId: 'g-2', questionType: 'QuestionGrid' },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-1', label: 'Row' },
        ])

        assert.throws(
            () => applyOperation(doc, { type: 'gridRow.delete', questionId: 'g-2', rowId: 'r-1' }),
            OperationConflictError,
        )
        assert.throws(
            () =>
                applyOperation(doc, {
                    type: 'gridRow.updateCell',
                    questionId: 'g-2',
                    rowId: 'r-1',
                    columnQuestionId: 'c-1',
                    value: 1,
                }),
            OperationConflictError,
        )
    })

    it('refuses to delete an alternative through the wrong question', () => {
        const created = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'RadioButtons' },
            { type: 'question.create', questionId: 'q-2', questionType: 'RadioButtons' },
            { type: 'alternative.create', questionId: 'q-1', alternativeId: 'a-1', label: 'Ja' },
        ])

        assert.throws(
            () => applyOperation(created, { type: 'alternative.delete', questionId: 'q-2', alternativeId: 'a-1' }),
            OperationConflictError,
        )
    })

    it('moves a grid row relative to its anchor, and to the front on a null anchor', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-1', label: 'One' },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-2', label: 'Two' },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-3', label: 'Three' },
        ])

        const reordered = applyOperation(doc, { type: 'gridRow.move', questionId: 'g-1', rowId: 'r-3', afterRowId: 'r-1' })
        assert.deepEqual(reordered.gridRowOrderByQuestionId?.['g-1'], ['r-1', 'r-3', 'r-2'])

        const fronted = applyOperation(doc, { type: 'gridRow.move', questionId: 'g-1', rowId: 'r-3', afterRowId: null })
        assert.deepEqual(fronted.gridRowOrderByQuestionId?.['g-1'], ['r-3', 'r-1', 'r-2'])

        assert.throws(
            () => applyOperation(doc, { type: 'gridRow.move', questionId: 'g-1', rowId: 'r-1', afterRowId: 'ghost' }),
            OperationConflictError,
        )
    })

    it('writes a grid column list as a primitive id array', () => {
        // `grid.columnIds` is a DOC-LAW-1 order array, so the op value carries the whole
        // array — never member-wise edits by position.
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'question.create', questionId: 'c-1', questionType: 'TextShort' },
        ])

        const columns = applyOperation(doc, { type: 'question.updateField', questionId: 'g-1', field: 'grid.columnIds', value: ['c-1'] })

        assert.deepEqual(columns.questionsById?.['g-1'], { type: 'QuestionGrid', grid: { columnIds: ['c-1'] } })
    })

    it('drops a deleted question from every grid\'s column list', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'question.create', questionId: 'c-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'c-2', questionType: 'DateField' },
            { type: 'question.updateField', questionId: 'g-1', field: 'grid.columnIds', value: ['c-1', 'c-2'] },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'c-1' })

        assert.deepEqual(deleted.questionsById?.['g-1']?.grid?.columnIds, ['c-2'])
    })

    it('drops the grid config key when its last field goes with a deleted column', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'question.create', questionId: 'c-1', questionType: 'TextShort' },
            { type: 'question.updateField', questionId: 'g-1', field: 'grid.columnIds', value: ['c-1'] },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'c-1' })

        // DOC-LAW-2: no `grid: {}` left behind — that would hash differently from never configured.
        assert.deepEqual(deleted.questionsById?.['g-1'], { type: 'QuestionGrid' })
    })

    it('attaches a mapping root and maintains bindingOrder across create and delete', () => {
        const attached = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-2', questionType: 'TextShort' },
            { type: 'mappingNode.create', nodeId: 'n-root', entityId: 'Actor' },
            { type: 'dataMapping.create', mappingId: 'm-1', sourceId: 'adopus-legacy', rootNodeId: 'n-root' },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-1',
                nodeId: 'n-root',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
            },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-2',
                nodeId: 'n-root',
                fieldId: 'Adresse',
                target: { kind: 'question', questionId: 'q-2' },
            },
        ])
        assert.deepEqual(attached.dataMappingsById?.['m-1']?.bindingOrder, ['b-1', 'b-2'])

        const removed = applyOperation(attached, { type: 'mappingBinding.delete', bindingId: 'b-1' })
        assert.deepEqual(removed.dataMappingsById?.['m-1']?.bindingOrder, ['b-2'])

        // …and an emptied order array is dropped, not stored (DOC-LAW-2).
        const emptied = applyOperation(removed, { type: 'mappingBinding.delete', bindingId: 'b-2' })
        assert.deepEqual(emptied.dataMappingsById?.['m-1'], { sourceId: 'adopus-legacy', rootNodeId: 'n-root' })
    })

    it('adopts bindings authored before the tree was attached into bindingOrder', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'mappingNode.create', nodeId: 'n-root', entityId: 'Actor' },
            // Binding BEFORE the mapping exists — structure first, mapping afterwards (Gate 2).
            {
                type: 'mappingBinding.create',
                bindingId: 'b-1',
                nodeId: 'n-root',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
            },
        ])
        assert.equal(doc.dataMappingsById, undefined)

        const attached = applyOperation(doc, {
            type: 'dataMapping.create',
            mappingId: 'm-1',
            sourceId: 'adopus-legacy',
            rootNodeId: 'n-root',
        })

        assert.deepEqual(attached.dataMappingsById?.['m-1']?.bindingOrder, ['b-1'])
    })

    it('rejects a dataMapping on a node that is not a root, and cascades the tree on delete', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
            { type: 'mappingNode.create', nodeId: 'n-root', entityId: 'Actor' },
            { type: 'mappingNode.create', nodeId: 'n-child', entityId: 'Soknad', parentNodeId: 'n-root', relationshipId: 'rel-1' },
        ])
        assert.throws(
            () => applyOperation(doc, { type: 'dataMapping.create', mappingId: 'm-1', sourceId: 's', rootNodeId: 'n-child' }),
            OperationConflictError,
        )

        const attached = apply(
            [
                { type: 'dataMapping.create', mappingId: 'm-1', sourceId: 'adopus-legacy', rootNodeId: 'n-root' },
                { type: 'mappingFilter.set', filterId: 'f-1', nodeId: 'n-child', fieldId: 'Status', operator: 'eq', value: 'Active' },
                {
                    type: 'mappingBinding.create',
                    bindingId: 'b-1',
                    nodeId: 'n-child',
                    fieldId: 'Dato',
                    target: { kind: 'question', questionId: 'q-1' },
                },
            ],
            doc,
        )

        const deleted = applyOperation(attached, { type: 'dataMapping.delete', mappingId: 'm-1' })
        assert.equal(deleted.dataMappingsById, undefined)
        assert.equal(deleted.mappingNodesById, undefined)
        assert.equal(deleted.mappingFiltersById, undefined)
        assert.equal(deleted.mappingBindingsById, undefined)

        // An already-gone mapping is a replayed duplicate — converge silently, content unchanged
        // (only the revision moves, which is the reducer's bookkeeping, not content).
        const replayed = applyOperation(deleted, { type: 'dataMapping.delete', mappingId: 'm-1' })
        assert.equal(replayed.dataMappingsById, undefined)
        assert.equal(replayed.revision, deleted.revision + 1)
    })
})
