import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    CollaborationError,
    OperationConflictError,
    UnknownOperationError,
    applyOperation,
} from './applyOperation.js'
import { canonicalJson, reduceToMinimalForm } from './canonicalize.js'
import type { TemplateOp } from './operations.js'
import { templateDocumentIsDefault } from './schemas.js'
import {
    BINDING_CARDINALITIES,
    BINDING_OPTION_DEFAULTS,
    bindingIsMultiValued,
    emptyTemplateDocument,
    resolveBindingOptions,
    type MappingBinding,
    type QnrTemplateDocument,
} from './templateDocument.js'

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

    it('drops the prefill rules that fill a deleted question, and its highlight settings', () => {
        // Prefill rules are keyed by the TARGET question, so the parallel to the four rule families
        // is "the rules that fill the deleted question go with it" (M-068).
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: ['q-1', 'q-2'],
            questionsById: { 'q-1': { type: 'TextShort' }, 'q-2': { type: 'TextShort' } },
            prefillRulesById: { 'pr-1': { sourceQuestionId: 'q-2' } },
            prefillRuleOrderByQuestionId: { 'q-1': ['pr-1'] },
            highlightRuleSettingsByQuestionId: { 'q-1': { enabled: true, requiredAll: true } },
        }

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'q-1' })

        assert.equal(deleted.prefillRulesById, undefined)
        assert.equal(deleted.prefillRuleOrderByQuestionId, undefined)
        assert.equal(deleted.highlightRuleSettingsByQuestionId, undefined)
    })

    it('keeps a prefill rule that merely SOURCES from the deleted question, dangling', () => {
        // Same rule as the visibility case below: the surviving question q-1 authored this prefill,
        // and dropping it because its source vanished would be silent data loss. The dangling
        // `sourceQuestionId` is for validation to report.
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: ['q-1', 'q-2'],
            questionsById: { 'q-1': { type: 'TextShort' }, 'q-2': { type: 'TextShort' } },
            prefillRulesById: { 'pr-1': { sourceQuestionId: 'q-2' } },
            prefillRuleOrderByQuestionId: { 'q-1': ['pr-1'] },
        }

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'q-2' })

        assert.deepEqual(deleted.prefillRuleOrderByQuestionId, { 'q-1': ['pr-1'] })
        assert.equal(deleted.prefillRulesById?.['pr-1']?.sourceQuestionId, 'q-2')
    })

    it('keeps the highlight settings of a question whose rules are stored but disabled', () => {
        // `toggleNarrative` flips have_narrative without clearing conditional[], so "stored but off"
        // is a real state: the rules stay and the settings entry simply carries no `enabled`.
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: ['q-1', 'q-2'],
            questionsById: { 'q-1': { type: 'TextShort' }, 'q-2': { type: 'TextShort' } },
            highlightRulesById: { 'hr-1': { condition: { sourceQuestionId: 'q-2' }, state: 2 } },
            highlightRuleOrderByQuestionId: { 'q-1': ['hr-1'] },
            highlightRuleSettingsByQuestionId: { 'q-1': { requiredAll: true } },
        }

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'q-2' })

        assert.deepEqual(deleted.highlightRuleSettingsByQuestionId, { 'q-1': { requiredAll: true } })
        assert.equal(deleted.highlightRulesById?.['hr-1']?.state, 2)
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

    it('reserves the column list and the row-editor layout for the grid-column operations', () => {
        // Ownership (`grid.columnIds`) and one-placement-per-column layout are what the atomic
        // grid ops exist to write. `question.updateField` carries a scalar or a whole primitive
        // array, so reaching either path through it could only write the map wholesale — columns
        // left owned by nobody, or every other column's placement dropped in one edit.
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
        ])

        for (const field of [
            'grid',
            'grid.columnIds',
            'grid.columnIds.0',
            'presentation.rowEditor',
            'presentation.rowEditor.layoutByQuestionId',
            'presentation.rowEditor.layoutByQuestionId.c-1.row',
        ]) {
            assert.throws(
                () => applyOperation(doc, { type: 'question.updateField', questionId: 'g-1', field, value: 'c-1' }),
                OperationConflictError,
                field,
            )
        }

        // The reservation is those two paths, not the bags that hold them: their siblings stay
        // ordinary authored fields.
        const configured = apply(
            [
                { type: 'question.updateField', questionId: 'g-1', field: 'grid.singleRow', value: true },
                { type: 'question.updateField', questionId: 'g-1', field: 'presentation.headerTabId', value: 't-1' },
            ],
            doc,
        )
        assert.deepEqual(configured.questionsById?.['g-1'], {
            type: 'QuestionGrid',
            grid: { singleRow: true },
            presentation: { headerTabId: 't-1' },
        })

        // Grid configuration belongs to a grid: the document schema admits `grid` on no other
        // type, so the reducer must not be the writer that puts it there.
        assert.throws(
            () =>
                applyOperation(doc, {
                    type: 'question.updateField',
                    questionId: 'q-1',
                    field: 'grid.singleRow',
                    value: true,
                }),
            OperationConflictError,
        )
    })

    it('refuses to write a question\'s type, so a grid cannot be flipped out from under its columns', () => {
        // `type` is the discriminant the document schema branches on: only a `QuestionGrid` may
        // carry `grid`. Flipping a grid that owns columns leaves a `columnIds` no reader accepts,
        // and the columns it names are then owned by nobody — nor do they cascade with the
        // delete, which collects owned columns only from a question still typed as a grid.
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
        ])

        // Refused wherever it is aimed, and on any path below it: `question.create` is the only
        // op that types a question, so there is no such thing as a legal type write here.
        for (const [questionId, field] of [
            ['g-1', 'type'],
            ['g-1', 'type.name'],
            ['c-1', 'type'],
            ['q-1', 'type'],
        ] as const) {
            assert.throws(
                () => applyOperation(doc, { type: 'question.updateField', questionId, field, value: 'TextShort' }),
                OperationConflictError,
                `${questionId} ${field}`,
            )
        }

        // Only `type` itself: a field that merely starts with the same letters is ordinary.
        const typed = applyOperation(doc, { type: 'question.updateField', questionId: 'g-1', field: 'typeHint', value: 'table' })
        assert.equal(typed.questionsById?.['g-1']?.['typeHint'], 'table')
        assert.equal(typed.questionsById?.['g-1']?.type, 'QuestionGrid')
    })

    it('drops a deleted question from every grid\'s column list', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'TextShort' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-2', questionType: 'DateField' },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'c-1' })

        assert.deepEqual(deleted.questionsById?.['g-1']?.grid?.columnIds, ['c-2'])
        assert.equal(deleted.questionsById?.['c-1'], undefined)
    })

    it('drops the grid config key when its last field goes with a deleted column', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'TextShort' },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'c-1' })

        // DOC-LAW-2: no `grid: {}` left behind — that would hash differently from never configured.
        assert.deepEqual(deleted.questionsById?.['g-1'], { type: 'QuestionGrid' })
    })

    it('takes a deleted grid\'s columns and predefined rows with it', () => {
        const doc = apply([
            { type: 'question.create', questionId: 'q-keep', questionType: 'TextShort' },
            { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'RadioButtons' },
            { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-2', questionType: 'TextShort' },
            // A column carries authored state of its own: it must cascade the same way a
            // top-level question's does, or the delete trades orphan questions for orphan rules.
            { type: 'alternative.create', questionId: 'c-1', alternativeId: 'a-1', label: 'Ja' },
            { type: 'visibilityRule.set', ruleId: 'vr-1', questionId: 'c-1', condition: { sourceQuestionId: 'q-keep' } },
            { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
            {
                type: 'mappingBinding.create',
                bindingId: 'b-1',
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'gridColumn', gridQuestionId: 'g-1', columnQuestionId: 'c-1' },
            },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-1' },
            { type: 'gridRow.create', questionId: 'g-1', rowId: 'r-2', label: 'Andre' },
            { type: 'gridRow.updateCell', questionId: 'g-1', rowId: 'r-1', columnQuestionId: 'c-2', value: 'one' },
        ])

        const deleted = applyOperation(doc, { type: 'question.delete', questionId: 'g-1' })

        assert.deepEqual(deleted.questionOrder, ['q-keep'])
        assert.deepEqual(Object.keys(deleted.questionsById ?? {}), ['q-keep'])
        // DOC-LAW-2 all the way down: the emptied collections are gone, not stored empty.
        assert.equal(deleted.gridRowsById, undefined)
        assert.equal(deleted.gridRowOrderByQuestionId, undefined)
        assert.equal(deleted.alternativesById, undefined)
        assert.equal(deleted.alternativeOrderByQuestionId, undefined)
        assert.equal(deleted.visibilityRulesById, undefined)
        assert.equal(deleted.mappingBindingsById, undefined)
        // The shared node survives: it is not the grid's to own.
        assert.deepEqual(deleted.mappingNodesById, { 'n-1': { entityId: 'Actor' } })
    })

    it('deletes a grid whose column list is malformed without recursing forever', () => {
        // Ownership cycles are not authorable, only importable. The cascade must terminate on
        // them rather than blow the stack — a crash here is a 500 on someone's delete click.
        const selfOwning = {
            ...doc0,
            questionsById: {
                'g-1': { type: 'QuestionGrid', grid: { columnIds: ['g-1', 'g-2'] } },
                'g-2': { type: 'QuestionGrid', grid: { columnIds: ['g-1'] } },
            },
            questionOrder: ['g-1'],
        } satisfies QnrTemplateDocument

        const deleted = applyOperation(selfOwning, { type: 'question.delete', questionId: 'g-1' })

        assert.equal(deleted.questionsById, undefined)
        assert.deepEqual(deleted.questionOrder, [])
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


/**
 * The binding behaviours — `cardinality` / `onMissing` / `onMany` (§2.2a, TASK-304 AC-6).
 *
 * Two rules meet on these three members and pull in opposite directions, which is what the suite is
 * really about. The author must be able to state them **explicitly**, because the compiler branches on
 * them and an artifact is immutable once minted; and DOC-LAW-2 says the *document* may never carry a
 * key at its own default, because the hash is computed on the minimal form. So "explicitly chosen" and
 * "stored" are deliberately not the same thing: choosing the default writes nothing.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-15-20-38-analysis-qnr-external-data-mapping-options.md:832
 */
describe('mappingBinding behaviours', () => {
    const bound = apply([
        { type: 'question.create', questionId: 'q-1', questionType: 'TextShort' },
        { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
    ])

    const create = (options: Partial<Pick<MappingBinding, 'cardinality' | 'onMissing' | 'onMany'>> = {}) =>
        applyOperation(bound, {
            type: 'mappingBinding.create',
            bindingId: 'b-1',
            nodeId: 'n-1',
            fieldId: 'Navn',
            target: { kind: 'question', questionId: 'q-1' },
            ...options,
        })

    const binding = (doc: QnrTemplateDocument) => doc.mappingBindingsById?.['b-1']

    it('stores a behaviour the author narrowed away from its default', () => {
        const doc = create({ cardinality: '0..*', onMissing: 'error', onMany: 'first' })

        assert.deepEqual(binding(doc), {
            nodeId: 'n-1',
            fieldId: 'Navn',
            target: { kind: 'question', questionId: 'q-1' },
            cardinality: '0..*',
            onMissing: 'error',
            onMany: 'first',
        })
    })

    it('omits each behaviour the author explicitly set to its own default (DOC-LAW-2)', () => {
        // One at a time, so a reducer that special-cased only `cardinality` cannot pass.
        for (const [key, value] of Object.entries(BINDING_OPTION_DEFAULTS)) {
            const doc = create({ [key]: value })

            assert.deepEqual(
                binding(doc),
                { nodeId: 'n-1', fieldId: 'Navn', target: { kind: 'question', questionId: 'q-1' } },
                `${key}: '${value}' is the default and must not be stored`,
            )
        }
    })

    it('makes an explicitly-defaulted binding byte-identical to an untouched one', () => {
        // The consequence that matters: `document_hash` decides whether a version is minted and
        // whether a re-import diverged. Two authors reaching the same binding through different
        // clicks must not produce two hashes.
        const untouched = canonicalJson(reduceToMinimalForm(create(), { isDefault: templateDocumentIsDefault }))
        const spelledOut = canonicalJson(
            reduceToMinimalForm(create({ cardinality: '0..1', onMissing: 'omit', onMany: 'error' }), {
                isDefault: templateDocumentIsDefault,
            }),
        )

        assert.equal(spelledOut, untouched)
    })

    it('sets, replaces and unsets a behaviour through update', () => {
        const set = applyOperation(create(), {
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { onMany: 'first' },
        })
        assert.equal(binding(set)?.onMany, 'first')

        const replaced = applyOperation(set, {
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { onMany: 'error' },
        })
        // 'error' IS the default, so replacing back to it removes the key rather than storing it.
        assert.equal('onMany' in (binding(replaced) ?? {}), false)

        const unset = applyOperation(set, {
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { onMany: null },
        })
        assert.equal('onMany' in (binding(unset) ?? {}), false)
    })

    it('leaves a behaviour alone when the patch does not name it', () => {
        const doc = create({ cardinality: '1..*', onMissing: 'error' })

        const patched = applyOperation(doc, {
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { fieldId: 'Adresse' },
        })

        assert.equal(binding(patched)?.fieldId, 'Adresse')
        assert.equal(binding(patched)?.cardinality, '1..*')
        assert.equal(binding(patched)?.onMissing, 'error')
    })

    it('never writes an explicit null into the document', () => {
        const doc = applyOperation(create({ onMissing: 'error' }), {
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { onMissing: null, cardinality: null, onMany: null },
        })

        assert.equal(canonicalJson(binding(doc)).includes('null'), false)
    })

    it('hydrates absent behaviours to the defaults every reader must agree on', () => {
        assert.deepEqual(resolveBindingOptions(binding(create()) as MappingBinding), BINDING_OPTION_DEFAULTS)

        assert.deepEqual(resolveBindingOptions(binding(create({ onMany: 'first' })) as MappingBinding), {
            ...BINDING_OPTION_DEFAULTS,
            onMany: 'first',
        })
    })

    it('reads exactly the starred cardinalities as multi-valued', () => {
        const multi = BINDING_CARDINALITIES.filter((cardinality) =>
            bindingIsMultiValued({
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
                cardinality,
            }),
        )

        assert.deepEqual(multi, ['0..*', '1..*'])
        // And the absent case resolves through the default, which is single-valued.
        assert.equal(bindingIsMultiValued(binding(create()) as MappingBinding), false)
    })
})
