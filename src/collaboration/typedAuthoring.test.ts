import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperation, OperationConflictError, knownActionFieldRefusal, tabFieldPathRefusal } from './applyOperation.js'
import { canonicalJson, reduceToMinimalForm } from './canonicalize.js'
import { findDocLawViolations } from './docLaws.js'
import type { TemplateOp } from './operations.js'
import { templateDocumentIsDefault, templateOpSchema, validateTemplateDocument } from './schemas.js'
import { QUESTION_TYPES, type QuestionType } from './questionTypes.js'
import {
    emptyTemplateDocument,
    isExpressionAlternativeToken,
    isExpressionTargetToken,
    isKnownActionKind,
    makeExpressionAlternativeToken,
    makeExpressionTargetToken,
    isKnownMappingFilterOperator,
    MAPPING_FILTER_OPERATORS,
    type QnrTemplateDocument,
} from './templateDocument.js'
import { type } from 'arktype'

/**
 * The ASMA-7683 additive authoring surface: typed grid presentation, tab layout, closed filters and
 * typed actions.
 *
 * Every addition here is **append-only over a released contract**, which is the property most of these
 * cases exist to defend. ADR-0008 DEC-006 forbids narrowing a shipped document or op shape, so
 * `MappingFilter.operator` stays a loose `string`, `QnrAction` stays an open bag with an arbitrary
 * `kind`, and `mappingFilter.set` / `action.create` / `action.updateField` keep replaying byte for byte.
 * The closed vocabularies arrive beside them, and only the new ops can write them.
 *
 * @see the ASMA-7683 shared freeze — §2-§5 and the required-test list
 */

const doc0 = emptyTemplateDocument('tpl-typed')
const apply = (ops: TemplateOp[], from: QnrTemplateDocument = doc0): QnrTemplateDocument =>
    ops.reduce((doc, op) => applyOperation(doc, op), from)

/** A grid with two columns, a tab, and a node to hang filters on. */
const scaffold = (): QnrTemplateDocument =>
    apply([
        { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
        { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'TextShort' },
        { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-2', questionType: 'DateField' },
        { type: 'question.create', questionId: 'q-top', questionType: 'TextShort' },
        { type: 'tab.create', tabId: 't-1', label: 'Første' },
        { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
    ])

const grid = (doc: QnrTemplateDocument) => doc.questionsById?.['g-1']
const action = (doc: QnrTemplateDocument, id: string) => doc.actionsById?.[id]
const throwsConflict = (fn: () => unknown, hint: string) =>
    assert.throws(fn, (error: unknown) => error instanceof OperationConflictError, hint)

// ─────────────────────────────── released-shape compatibility ───────────────────────────────

describe('the released shapes still replay byte for byte', () => {
    it('keeps mappingFilter.set with an operator outside the closed set', () => {
        // `contains` is stored in real documents. Narrowing `operator` would make them unreplayable,
        // which is precisely what DEC-006 forbids — so the loose write stays as released.
        const doc = apply(
            [{ type: 'mappingFilter.set', filterId: 'f-1', nodeId: 'n-1', fieldId: 'Navn', operator: 'contains', value: 'ada' }],
            scaffold(),
        )

        assert.deepEqual(doc.mappingFiltersById?.['f-1'], { fieldId: 'Navn', operator: 'contains', value: 'ada' })
        assert.equal(isKnownMappingFilterOperator('contains'), false)
        // And it is still a valid document: readability is the compatibility guarantee.
        assert.equal(validateTemplateDocument(doc).ok, true)
    })

    it('keeps action.create and action.updateField on an unknown kind, buffers included', () => {
        const doc = apply(
            [
                { type: 'action.create', actionId: 'x-legacy', kind: 'submit' },
                { type: 'action.updateField', actionId: 'x-legacy', field: 'editable_label', value: true },
                { type: 'action.updateField', actionId: 'x-legacy', field: 'label', value: 'Send' },
            ],
            scaffold(),
        )

        // The buffer lands, because on a legacy record it always did.
        assert.deepEqual(action(doc, 'x-legacy'), { kind: 'submit', editable_label: true, label: 'Send' })
        assert.equal(isKnownActionKind('submit'), false)
        assert.equal(validateTemplateDocument(doc).ok, true)
    })

    it('reads an old broad stored action and filter', () => {
        // Hand-built rather than op-produced: this is what an imported document looks like.
        const stored = {
            ...emptyTemplateDocument('tpl-old'),
            questionOrder: ['q-1'],
            questionsById: { 'q-1': { type: 'TextShort' as const } },
            actionsById: { 'x-1': { kind: 'weird', editable_type: 'COPY', nested: { anything: 1 } } },
            mappingNodesById: { 'n-1': { entityId: 'Actor', filterOrder: ['f-1'] } },
            mappingFiltersById: { 'f-1': { fieldId: 'Navn', operator: 'startsWith', value: 'a' } },
        } as unknown as QnrTemplateDocument

        assert.equal(validateTemplateDocument(stored).ok, true)
        assert.deepEqual(findDocLawViolations(stored), [])
    })
})

// ─────────────────────────────── §4 closed filter authoring ───────────────────────────────

describe('mappingFilter.setTyped', () => {
    const setTyped = (payload: Record<string, unknown>) =>
        ({ type: 'mappingFilter.setTyped', filterId: 'f-1', nodeId: 'n-1', fieldId: 'Navn', ...payload }) as TemplateOp

    it('writes exactly the four operators and their canonical payloads', () => {
        const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
            [{ operator: 'eq', value: 'ada' }, { fieldId: 'Navn', operator: 'eq', value: 'ada' }],
            [{ operator: 'in', values: ['a', 'b'] }, { fieldId: 'Navn', operator: 'in', values: ['a', 'b'] }],
            [{ operator: 'range', from: 1, to: 9 }, { fieldId: 'Navn', operator: 'range', from: 1, to: 9 }],
            [{ operator: 'range', from: 1 }, { fieldId: 'Navn', operator: 'range', from: 1 }],
            [{ operator: 'range', to: 9 }, { fieldId: 'Navn', operator: 'range', to: 9 }],
            [{ operator: 'isNull', value: true }, { fieldId: 'Navn', operator: 'isNull', value: true }],
        ]

        for (const [payload, expected] of cases) {
            const doc = apply([setTyped(payload)], scaffold())
            assert.deepEqual(doc.mappingFiltersById?.['f-1'], expected, JSON.stringify(payload))
        }

        assert.deepEqual([...MAPPING_FILTER_OPERATORS], ['eq', 'in', 'range', 'isNull'])
    })

    it('registers the filter in its node order, exactly once', () => {
        const doc = apply([setTyped({ operator: 'eq', value: 'ada' }), setTyped({ operator: 'in', values: ['b'] })], scaffold())

        assert.deepEqual(doc.mappingNodesById?.['n-1']?.filterOrder, ['f-1'])
    })

    it('deletes every stale member when the operator switches', () => {
        // The reason the reducer REPLACES rather than patches: a merged record would carry `value`
        // beside `values`, and no reader could tell which one the operator meant.
        let doc = apply([setTyped({ operator: 'eq', value: 'ada' })], scaffold())
        doc = apply([setTyped({ operator: 'in', values: ['a', 'b'] })], doc)
        assert.deepEqual(doc.mappingFiltersById?.['f-1'], { fieldId: 'Navn', operator: 'in', values: ['a', 'b'] })

        doc = apply([setTyped({ operator: 'range', from: 1 })], doc)
        assert.deepEqual(doc.mappingFiltersById?.['f-1'], { fieldId: 'Navn', operator: 'range', from: 1 })

        doc = apply([setTyped({ operator: 'isNull', value: false })], doc)
        assert.deepEqual(doc.mappingFiltersById?.['f-1'], { fieldId: 'Navn', operator: 'isNull', value: false })
    })

    it('refuses at the schema what the typed path may not express', () => {
        const invalid: Array<[string, Record<string, unknown>]> = [
            ['an operator outside the closed set', { operator: 'contains', value: 'a' }],
            ['an empty in-list', { operator: 'in', values: [] }],
            ['a range with neither bound', { operator: 'range' }],
            ['eq with no value', { operator: 'eq' }],
            ['isNull with a non-boolean', { operator: 'isNull', value: 'yes' }],
            ['eq carrying a stale values member', { operator: 'eq', value: 'a', values: ['b'] }],
            ['in carrying a stale value member', { operator: 'in', values: ['b'], value: 'a' }],
            ['range carrying a stale value member', { operator: 'range', from: 1, value: 'a' }],
        ]

        for (const [hint, payload] of invalid) {
            const result = templateOpSchema(setTyped(payload))
            assert.ok(result instanceof type.errors, hint)
        }
    })

    it('refuses a node that does not exist', () => {
        throwsConflict(
            () => apply([{ ...(setTyped({ operator: 'eq', value: 'a' }) as object), nodeId: 'n-ghost' } as TemplateOp], scaffold()),
            'unknown node',
        )
    })
})

// ─────────────────────────────── §2 typed grid presentation ───────────────────────────────

describe('gridColumn.setFilter and setAction', () => {
    it('inserts, moves and removes one member at a time', () => {
        let doc = apply(
            [
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-1', include: true },
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: true },
            ],
            scaffold(),
        )
        assert.deepEqual(grid(doc)?.presentation?.filterQuestionIds, ['c-1', 'c-2'])

        // A move is an insert with an index, not a delete-then-add.
        doc = apply([{ type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: true, atIndex: 0 }], doc)
        assert.deepEqual(grid(doc)?.presentation?.filterQuestionIds, ['c-2', 'c-1'])

        // Re-including without an index is a no-op rather than a duplicate.
        doc = apply([{ type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: true }], doc)
        assert.deepEqual(grid(doc)?.presentation?.filterQuestionIds, ['c-2', 'c-1'])

        doc = apply(
            [
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-1', include: false },
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: false },
            ],
            doc,
        )
        // Emptied list is omitted, not stored as [] (DOC-LAW-2).
        assert.equal('filterQuestionIds' in (grid(doc)?.presentation ?? {}), false)
        assert.equal(grid(doc)?.presentation, undefined)
    })

    it('lets two authors add DIFFERENT filters concurrently without either being lost', () => {
        // The whole reason these are member-wise ops. Both edits are computed against the same base and
        // replayed in sequence, which is what a wholesale array write would break.
        const base = scaffold()
        const mine = { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-1', include: true } as const
        const theirs = { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: true } as const

        const oneOrder = apply([mine, theirs], base)
        const otherOrder = apply([theirs, mine], base)

        assert.deepEqual(grid(oneOrder)?.presentation?.filterQuestionIds, ['c-1', 'c-2'])
        assert.deepEqual(grid(otherOrder)?.presentation?.filterQuestionIds, ['c-2', 'c-1'])
        // Order differs by arrival, but nobody's filter disappeared.
        for (const doc of [oneOrder, otherOrder]) {
            assert.deepEqual([...(grid(doc)?.presentation?.filterQuestionIds ?? [])].sort(), ['c-1', 'c-2'])
        }
    })

    it('refuses a filter on a question the grid does not own', () => {
        throwsConflict(
            () => apply([{ type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'q-top', include: true }], scaffold()),
            'top-level question is not a column',
        )
    })

    it('keeps a grid action owned by at most one grid', () => {
        const base = apply(
            [
                { type: 'question.create', questionId: 'g-2', questionType: 'QuestionGrid' },
                { type: 'action.createTyped', actionId: 'x-1', kind: 'gridAction' },
                { type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-1', include: true },
            ],
            scaffold(),
        )

        // Two owners would give one action two column vocabularies for its metadata.
        throwsConflict(
            () => apply([{ type: 'gridColumn.setAction', questionId: 'g-2', actionId: 'x-1', include: true }], base),
            'second owner',
        )
    })

    it('reserves both lists from question.updateField, in both directions', () => {
        for (const field of [
            'presentation.filterQuestionIds',
            'presentation.filterQuestionIds.0',
            'presentation.actionIds',
            'presentation',
        ]) {
            throwsConflict(
                () => apply([{ type: 'question.updateField', questionId: 'g-1', field, value: 'x' }], scaffold()),
                field,
            )
        }

        // The neighbouring scalars stay ordinary field edits.
        const doc = apply(
            [
                { type: 'question.updateField', questionId: 'g-1', field: 'presentation.headerTabId', value: 't-1' },
                { type: 'question.updateField', questionId: 'g-1', field: 'presentation.defaultColumnWidthsByQuestionId.c-1', value: 120 },
            ],
            scaffold(),
        )
        assert.equal(grid(doc)?.presentation?.headerTabId, 't-1')
        assert.equal(grid(doc)?.presentation?.defaultColumnWidthsByQuestionId?.['c-1'], 120)
    })
})

// ─────────────────────────────── §3 tab layout ───────────────────────────────

describe('tab.setLayout', () => {
    const placements = (doc: QnrTemplateDocument) =>
        (doc.tabsById?.['t-1']?.layout ?? {})['placementsByQuestionId'] as Record<string, unknown> | undefined

    it('writes and clears a whole placement atomically', () => {
        let doc = apply(
            [{ type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 2, cell: 1, keepCellSize: true } }],
            scaffold(),
        )
        assert.deepEqual(placements(doc)?.['c-1'], { row: 2, cell: 1, keepCellSize: true })

        doc = apply([{ type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: null }], doc)
        // Emptied containers are dropped all the way up.
        assert.equal(doc.tabsById?.['t-1']?.layout, undefined)
        assert.deepEqual(doc.tabsById?.['t-1'], { label: 'Første' })
    })

    it('never tears a placement into a row/cell hybrid', () => {
        const base = apply(
            [{ type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 1, cell: 1 } }],
            scaffold(),
        )
        const moved = apply(
            [{ type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 4, cell: 3 } }],
            base,
        )

        // Last-writer-wins on ONE whole tuple: never row from one edit and cell from another.
        assert.deepEqual(placements(moved)?.['c-1'], { row: 4, cell: 3 })
    })

    it('lets concurrent moves of different questions both survive', () => {
        const base = scaffold()
        const mine = { type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 0, cell: 0 } } as const
        const theirs = { type: 'tab.setLayout', tabId: 't-1', questionId: 'c-2', placement: { row: 1, cell: 1 } } as const

        for (const doc of [apply([mine, theirs], base), apply([theirs, mine], base)]) {
            assert.deepEqual(placements(doc)?.['c-1'], { row: 0, cell: 0 })
            assert.deepEqual(placements(doc)?.['c-2'], { row: 1, cell: 1 })
        }
    })

    it('reserves the placements map from tab.updateField', () => {
        for (const field of ['layout.placementsByQuestionId', 'layout.placementsByQuestionId.c-1', 'layout']) {
            assert.notEqual(tabFieldPathRefusal(field), undefined, field)
            throwsConflict(
                () => apply([{ type: 'tab.updateField', tabId: 't-1', field, value: 'x' }], scaffold()),
                field,
            )
        }
        assert.equal(tabFieldPathRefusal('label'), undefined)
    })

    it('scrubs a deleted question from every tab layout', () => {
        const doc = apply(
            [
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 0, cell: 0 } },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'c-2', placement: { row: 1, cell: 0 } },
                { type: 'question.delete', questionId: 'c-1' },
            ],
            scaffold(),
        )

        assert.deepEqual(Object.keys(placements(doc) ?? {}), ['c-2'])
    })

    it('scrubs a deleted tab from every grid that named it as header', () => {
        const doc = apply(
            [
                { type: 'question.updateField', questionId: 'g-1', field: 'presentation.headerTabId', value: 't-1' },
                { type: 'tab.delete', tabId: 't-1' },
            ],
            scaffold(),
        )

        // The reference is gone, and so is the container it emptied.
        assert.equal(grid(doc)?.presentation, undefined)
        assert.equal(doc.tabsById, undefined)
    })
})

// ─────────────────────────────── §5 typed actions ───────────────────────────────

describe('typed actions', () => {
    const withActions = (): QnrTemplateDocument =>
        apply(
            [
                { type: 'action.createTyped', actionId: 'x-grid', kind: 'gridAction', label: 'Kopier', actionType: 'COPY' },
                { type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-grid', include: true },
                { type: 'action.createTyped', actionId: 'x-top', kind: 'topLevelAction', label: 'Kjør' },
            ],
            scaffold(),
        )

    it('creates a known action in minimal form', () => {
        const doc = apply([{ type: 'action.createTyped', actionId: 'x-1', kind: 'topLevelAction' }], scaffold())

        // No empty label, no empty collections.
        assert.deepEqual(action(doc, 'x-1'), { kind: 'topLevelAction' })
    })

    it('refuses actionType on a top-level action', () => {
        throwsConflict(
            () =>
                apply(
                    [{ type: 'action.createTyped', actionId: 'x-1', kind: 'topLevelAction', actionType: 'COPY' }],
                    scaffold(),
                ),
            'actionType is a gridAction member',
        )
    })

    it('cannot mint a UI edit buffer through the typed path', () => {
        for (const buffer of ['editableLabel', 'editableType', 'editable_label', 'editable_type']) {
            const result = templateOpSchema({
                type: 'action.createTyped',
                actionId: 'x-1',
                kind: 'gridAction',
                [buffer]: true,
            })
            assert.ok(result instanceof type.errors, buffer)
        }
    })

    it('refuses UI buffers and reserved collections on a KNOWN action, and permits label', () => {
        const base = withActions()

        for (const field of [
            'editable_label',
            'editableType',
            'kind',
            'metadataByQuestionId',
            'metadataByQuestionId.c-1',
            'actionIdsByGridQuestionId',
        ]) {
            assert.notEqual(knownActionFieldRefusal('gridAction', field), undefined, field)
            throwsConflict(
                () => apply([{ type: 'action.updateField', actionId: 'x-grid', field, value: 'x' }], base),
                field,
            )
        }

        // `actionType` is a gridAction member only.
        assert.equal(knownActionFieldRefusal('gridAction', 'actionType'), undefined)
        assert.notEqual(knownActionFieldRefusal('topLevelAction', 'actionType'), undefined)

        const doc = apply([{ type: 'action.updateField', actionId: 'x-grid', field: 'label', value: 'Ny' }], base)
        assert.equal(action(doc, 'x-grid')?.label, 'Ny')
    })

    it('refuses the typed ops on a legacy unknown-kind record', () => {
        const base = apply([{ type: 'action.create', actionId: 'x-legacy', kind: 'submit' }], scaffold())

        throwsConflict(
            () =>
                apply(
                    [{ type: 'action.setMetadata', actionId: 'x-legacy', questionId: 'c-1', metadata: { all: true } }],
                    base,
                ),
            'legacy record is not a known gridAction',
        )
    })

    it('keeps a top-level grid reference member-wise and ordered', () => {
        let doc = apply(
            [
                { type: 'action.createTyped', actionId: 'x-grid-2', kind: 'gridAction' },
                { type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-grid-2', include: true },
                { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid', include: true },
                { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid-2', include: true },
            ],
            withActions(),
        )
        assert.deepEqual(action(doc, 'x-top')?.['actionIdsByGridQuestionId'], { 'g-1': ['x-grid', 'x-grid-2'] })

        doc = apply(
            [{ type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid-2', include: true, atIndex: 0 }],
            doc,
        )
        assert.deepEqual(action(doc, 'x-top')?.['actionIdsByGridQuestionId'], { 'g-1': ['x-grid-2', 'x-grid'] })

        doc = apply(
            [
                { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid', include: false },
                { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid-2', include: false },
            ],
            doc,
        )
        // Emptied sequence drops its grid key; emptied map is omitted.
        assert.deepEqual(action(doc, 'x-top'), { kind: 'topLevelAction', label: 'Kjør' })
    })

    it('lets two concurrent reference inserts both survive', () => {
        const base = apply(
            [
                { type: 'action.createTyped', actionId: 'x-grid-2', kind: 'gridAction' },
                { type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-grid-2', include: true },
            ],
            withActions(),
        )
        const mine = { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid', include: true } as const
        const theirs = { type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid-2', include: true } as const

        for (const doc of [apply([mine, theirs], base), apply([theirs, mine], base)]) {
            const sequence = (action(doc, 'x-top')?.['actionIdsByGridQuestionId'] as Record<string, string[]>)['g-1']
            assert.deepEqual([...(sequence ?? [])].sort(), ['x-grid', 'x-grid-2'])
        }
    })

    it('refuses a reference to an action the grid does not own, or to a top-level one', () => {
        const base = apply([{ type: 'action.createTyped', actionId: 'x-orphan', kind: 'gridAction' }], withActions())

        throwsConflict(
            () =>
                apply(
                    [{ type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-orphan', include: true }],
                    base,
                ),
            'unowned grid action',
        )
        throwsConflict(
            () =>
                apply(
                    [{ type: 'action.setGridActionRef', actionId: 'x-grid', gridQuestionId: 'g-1', gridActionId: 'x-grid', include: true }],
                    base,
                ),
            'setGridActionRef is topLevelAction-only',
        )
    })

    it('writes canonical metadata and refuses the ambiguous shapes', () => {
        const base = withActions()

        const all = apply([{ type: 'action.setMetadata', actionId: 'x-grid', questionId: 'c-1', metadata: { all: true } }], base)
        assert.deepEqual(action(all, 'x-grid')?.['metadataByQuestionId'], { 'c-1': { all: true } })

        const bounded = apply(
            [{ type: 'action.setMetadata', actionId: 'x-grid', questionId: 'c-1', metadata: { from: 'a', to: 'b' } }],
            base,
        )
        assert.deepEqual(action(bounded, 'x-grid')?.['metadataByQuestionId'], { 'c-1': { from: 'a', to: 'b' } })

        // A bare {} and all+bounds are both ambiguous, and both are refused at the schema.
        for (const metadata of [{}, { all: true, from: 'a' }]) {
            const result = templateOpSchema({
                type: 'action.setMetadata',
                actionId: 'x-grid',
                questionId: 'c-1',
                metadata,
            })
            assert.ok(result instanceof type.errors, JSON.stringify(metadata))
        }

        const cleared = apply([{ type: 'action.setMetadata', actionId: 'x-grid', questionId: 'c-1', metadata: null }], all)
        assert.deepEqual(action(cleared, 'x-grid'), { kind: 'gridAction', label: 'Kopier', actionType: 'COPY' })
    })

    it('keeps all:true through canonical reduction and the hash', () => {
        // The marker's whole purpose: DOC-LAW-2 strips defaults and empties, so an all-to-all selection
        // encoded as `{}` or as nulls would vanish and become "not selected".
        const doc = apply([{ type: 'action.setMetadata', actionId: 'x-grid', questionId: 'c-1', metadata: { all: true } }], withActions())

        const reduced = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
        const json = canonicalJson(reduced)

        assert.ok(json.includes('"all":true'), 'all:true must survive reduction')
        assert.deepEqual(findDocLawViolations(reduced), [])
        assert.equal(validateTemplateDocument(doc).ok, true)
    })

    it('refuses ambiguous metadata in the REDUCER too, not only at the wire', () => {
        // The wire schema rejects these, so this reaches past it deliberately: the reducer is replayed
        // over a stored `collab_ops` log without re-validating each op, which is the path an op written
        // by an older or bypassed client actually takes. Two lines, same rule — the pattern
        // `questionFieldPathRefusal` already follows for the grid-owned paths.
        for (const metadata of [{}, { all: true, from: 'a' }, { all: true, to: 'b' }]) {
            throwsConflict(
                () =>
                    apply(
                        [
                            {
                                type: 'action.setMetadata',
                                actionId: 'x-grid',
                                questionId: 'c-1',
                                metadata,
                            } as unknown as TemplateOp,
                        ],
                        withActions(),
                    ),
                JSON.stringify(metadata),
            )
        }
    })

    it('refuses metadata for a question that is not a column of the owning grid', () => {
        throwsConflict(
            () =>
                apply(
                    [{ type: 'action.setMetadata', actionId: 'x-grid', questionId: 'q-top', metadata: { all: true } }],
                    withActions(),
                ),
            'top-level question is not a column',
        )
    })

    it('scrubs references when a grid action is removed or deleted', () => {
        const base = apply(
            [{ type: 'action.setGridActionRef', actionId: 'x-top', gridQuestionId: 'g-1', gridActionId: 'x-grid', include: true }],
            withActions(),
        )
        assert.deepEqual(action(base, 'x-top')?.['actionIdsByGridQuestionId'], { 'g-1': ['x-grid'] })

        // Un-owning it makes the top-level reference unexpressible, so it goes at the same moment.
        const unowned = apply([{ type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-grid', include: false }], base)
        assert.equal('actionIdsByGridQuestionId' in (action(unowned, 'x-top') ?? {}), false)
        assert.equal('actionIds' in (grid(unowned)?.presentation ?? {}), false)

        // Deleting it scrubs both homes too.
        const deleted = apply([{ type: 'action.delete', actionId: 'x-grid' }], base)
        assert.equal(action(deleted, 'x-grid'), undefined)
        assert.equal('actionIdsByGridQuestionId' in (action(deleted, 'x-top') ?? {}), false)
        assert.equal('actionIds' in (grid(deleted)?.presentation ?? {}), false)
    })

    it('scrubs a deleted column from the grid filter list, layout and widths', () => {
        const doc = apply(
            [
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-1', include: true },
                { type: 'gridColumn.setFilter', questionId: 'g-1', columnQuestionId: 'c-2', include: true },
                { type: 'gridColumn.setLayout', questionId: 'g-1', columnQuestionId: 'c-1', placement: { row: 0, cell: 0 } },
                { type: 'question.updateField', questionId: 'g-1', field: 'presentation.defaultColumnWidthsByQuestionId.c-1', value: 90 },
                { type: 'question.delete', questionId: 'c-1' },
            ],
            scaffold(),
        )

        assert.deepEqual(grid(doc)?.presentation?.filterQuestionIds, ['c-2'])
        assert.equal(grid(doc)?.presentation?.rowEditor, undefined)
        assert.equal(grid(doc)?.presentation?.defaultColumnWidthsByQuestionId, undefined)
    })
})

// ─────────────────────────────── §1 bundle fragment ───────────────────────────────

describe('the bundle carries a mapping fragment', () => {
    it('types the four graph collections beside the question collections', () => {
        // The shared half of §1: the shape exists so a pick cannot lose mapping. Reference CLOSURE is
        // the library writer's job (asma-bunjs-editor) and is deliberately not asserted here.
        const bundle = {
            rootQuestionId: 'g-1',
            questionsById: {
                'g-1': { type: 'QuestionGrid' as const, grid: { columnIds: ['c-1'] } },
                'c-1': { type: 'TextShort' as const },
            },
            tabsById: { 't-1': { label: 'Første', layout: { placementsByQuestionId: { 'c-1': { row: 0, cell: 0 } } } } },
            actionsById: { 'x-1': { kind: 'gridAction', actionType: 'COPY' as const } },
            dataMappingsById: { 'm-1': { sourceId: 'adopus-legacy', rootNodeId: 'n-1', bindingOrder: ['b-1'] } },
            mappingNodesById: { 'n-1': { entityId: 'Actor', filterOrder: ['f-1'] } },
            mappingBindingsById: {
                'b-1': { nodeId: 'n-1', fieldId: 'Navn', target: { kind: 'gridColumn' as const, gridQuestionId: 'g-1', columnQuestionId: 'c-1' } },
            },
            mappingFiltersById: { 'f-1': { fieldId: 'Status', operator: 'in', values: ['A', 'B'] } },
        }

        // DOC-LAW-1/2 hold over the fragment: keyed records, primitive order arrays, nothing empty.
        assert.deepEqual(findDocLawViolations(bundle), [])
        assert.deepEqual(Object.keys(bundle.mappingFiltersById['f-1']), ['fieldId', 'operator', 'values'])
    })
})

// ───────────────────── tab membership and the counted-grid subset (freeze §3a) ─────────────────────

/**
 * Membership is a THIRD tab concern beside layout, not a view of it.
 *
 * Post-release importer scrutiny corrected the field inventory: legacy `dependent_question_ids` is tab
 * membership, and the committed fixture proving it carries a counted composite member with **no**
 * positional placement. So the placement key set is strictly narrower than membership, and any attempt
 * to derive one from the other loses that member — which is why these cases assert the three locations
 * move independently and only cascade in the one direction the freeze specifies.
 */
describe('tab membership', () => {
    const tab = (doc: QnrTemplateDocument, id = 't-1') => doc.tabsById?.[id]

    it('appends, does not duplicate, and moves to a clamped index', () => {
        const base = apply(
            [
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true },
            ],
            scaffold(),
        )
        assert.deepEqual(tab(base)?.questionIds, ['q-top', 'g-1'])

        // Re-including an existing member is idempotent on the list, not a second entry.
        assert.deepEqual(
            tab(apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true }], base))?.questionIds,
            ['q-top', 'g-1'],
        )
        // An out-of-range index clamps rather than tearing the list.
        assert.deepEqual(
            tab(apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true, atIndex: 99 }], base))
                ?.questionIds,
            ['g-1', 'q-top'],
        )
        assert.deepEqual(
            tab(apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true, atIndex: 0 }], base))
                ?.questionIds,
            ['g-1', 'q-top'],
        )
    })

    it('omits the emptied list and keeps the tab', () => {
        const doc = apply(
            [
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: false },
            ],
            scaffold(),
        )
        // DOC-LAW-2: an empty list is absent, never stored as `[]`.
        assert.equal('questionIds' in (tab(doc) ?? {}), false)
        assert.deepEqual(tab(doc), { label: 'Første' })
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('refuses including a question the document does not have, but allows excluding one', () => {
        throwsConflict(
            () => apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'ghost', include: true }], scaffold()),
            'include:true must require a live question',
        )
        // Exclusion stays available with no such question: an imported tab naming a question it never
        // had must be repairable, and refusing would leave the document permanently malformed.
        assert.doesNotThrow(() =>
            apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'ghost', include: false }], scaffold()),
        )
        throwsConflict(
            () => apply([{ type: 'tab.setQuestion', tabId: 'ghost', questionId: 'q-top', include: true }], scaffold()),
            'an unknown tab is always a conflict',
        )
    })

    it('two clients adding different members converge in either order', () => {
        const base = scaffold()
        const a: TemplateOp = { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true }
        const b: TemplateOp = { type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true }

        // The lost update a whole-array write would cause: both members must survive both orders.
        assert.deepEqual(tab(apply([a, b], base))?.questionIds, ['q-top', 'g-1'])
        assert.deepEqual(tab(apply([b, a], base))?.questionIds, ['g-1', 'q-top'])
    })

    it('removing membership atomically drops that question count and placement', () => {
        const base = apply(
            [
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
                { type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'g-1', placement: { row: 0, cell: 0 } },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'q-top', placement: { row: 1, cell: 0 } },
                { type: 'tab.updateField', tabId: 't-1', field: 'count_question_rows_legacy', value: 'kept' },
            ],
            scaffold(),
        )

        const doc = apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: false }], base)
        assert.deepEqual(tab(doc)?.questionIds, ['q-top'])
        // A count or placement for a non-member is a reference to something the tab no longer shows.
        assert.equal('rowCountQuestionIds' in (tab(doc) ?? {}), false)
        assert.deepEqual(tab(doc)?.layout, { placementsByQuestionId: { 'q-top': { row: 1, cell: 0 } } })
        // Unrelated members, the surviving placement, the label and an open legacy field are untouched.
        assert.equal(tab(doc)?.label, 'Første')
        assert.equal(tab(doc)?.['count_question_rows_legacy'], 'kept')
    })

    it('one question in two tabs leaves the other tab alone', () => {
        const base = apply(
            [
                { type: 'tab.create', tabId: 't-2', label: 'Andre' },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
                { type: 'tab.setQuestion', tabId: 't-2', questionId: 'q-top', include: true },
            ],
            scaffold(),
        )
        // There is deliberately no single-tab ownership invariant, so removing from one is local.
        const doc = apply([{ type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: false }], base)
        assert.equal('questionIds' in (tab(doc, 't-1') ?? {}), false)
        assert.deepEqual(tab(doc, 't-2')?.questionIds, ['q-top'])
    })
})

describe('the counted-grid subset', () => {
    const tab = (doc: QnrTemplateDocument, id = 't-1') => doc.tabsById?.[id]
    const withMembers = () =>
        apply(
            [
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
            ],
            scaffold(),
        )

    it('counts a member grid and leaves membership and layout untouched', () => {
        const doc = apply(
            [
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'g-1', placement: { row: 0, cell: 0 } },
                { type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-1', include: true },
            ],
            withMembers(),
        )
        assert.deepEqual(tab(doc)?.rowCountQuestionIds, ['g-1'])
        assert.deepEqual(tab(doc)?.questionIds, ['g-1', 'q-top'])
        assert.deepEqual(tab(doc)?.layout, { placementsByQuestionId: { 'g-1': { row: 0, cell: 0 } } })
    })

    it('refuses a scalar question, a non-member grid, a missing question and a missing tab', () => {
        // Only a grid has rows to count.
        throwsConflict(
            () => apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'q-top', include: true }], withMembers()),
            'a scalar question has no rows',
        )
        // A grid that exists but is not shown by this tab contributes nothing to its count.
        const nonMember = apply([{ type: 'question.create', questionId: 'g-2', questionType: 'QuestionGrid' }], withMembers())
        throwsConflict(
            () => apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-2', include: true }], nonMember),
            'a non-member grid must be refused',
        )
        throwsConflict(
            () => apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'ghost', include: true }], withMembers()),
            'a missing question must be refused',
        )
        throwsConflict(
            () => apply([{ type: 'tab.setRowCountQuestion', tabId: 'ghost', questionId: 'g-1', include: true }], withMembers()),
            'a missing tab must be refused',
        )
    })

    it('refuses a DANGLING member id, so the existence check is what does the work', () => {
        // The `'ghost'` case above is *also* a nonmember, so the membership check refuses it and the
        // existence check is never exercised — the same "passes for the wrong reason" shape as the
        // A11/A12/A39 gaps. Here the id IS a member, so membership passes and only the existence guard
        // can refuse.
        //
        // The document is built by hand on purpose: no legal sequence of ops can put a dangling id in
        // `questionIds` (`tab.setQuestion include:true` requires a live question). This is the imported
        // malformed state the freeze says must stay repairable, so it is reachable in production.
        const imported: QnrTemplateDocument = {
            ...withMembers(),
            tabsById: { 't-1': { label: 'Første', questionIds: ['ghost-grid'] } },
        }

        throwsConflict(
            () => apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'ghost-grid', include: true }], imported),
            'a dangling member id must still be refused as a missing question',
        )
        // And the repair path stays open on that same document, which is why the state is worth having.
        assert.doesNotThrow(() =>
            apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'ghost-grid', include: false }], imported),
        )
    })

    it('repairs every one of those malformed cases by excluding', () => {
        // Exclusion requires neither a live question nor valid membership: an imported document whose
        // count names a scalar, a non-member or a deleted question must be fixable in place.
        const imported = apply(
            [{ type: 'tab.updateField', tabId: 't-1', field: 'label', value: 'Fane' }],
            withMembers(),
        )
        for (const questionId of ['q-top', 'ghost', 'g-1']) {
            assert.doesNotThrow(
                () => apply([{ type: 'tab.setRowCountQuestion', tabId: 't-1', questionId, include: false }], imported),
                `excluding "${questionId}" must stay available`,
            )
        }
    })

    it('does not add or remove membership', () => {
        const doc = apply(
            [
                { type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-1', include: false },
            ],
            withMembers(),
        )
        assert.deepEqual(tab(doc)?.questionIds, ['g-1', 'q-top'])
        assert.equal('rowCountQuestionIds' in (tab(doc) ?? {}), false)
    })
})

describe('tab.updateField reserves all three tab-owned collections', () => {
    it('refuses the exact path, an ancestor and a descendant for each', () => {
        for (const field of [
            'questionIds',
            'questionIds.0',
            'rowCountQuestionIds',
            'rowCountQuestionIds.1',
            'layout',
            'layout.placementsByQuestionId',
            'layout.placementsByQuestionId.q-top',
        ]) {
            assert.notEqual(tabFieldPathRefusal(field), undefined, `"${field}" must be reserved`)
        }
    })

    it('still accepts the label and an unrelated legacy field', () => {
        // Narrowing the open bag would make an imported tab unwritable — DEC-006's whole point.
        assert.equal(tabFieldPathRefusal('label'), undefined)
        assert.equal(tabFieldPathRefusal('count_question_rows'), undefined)
        const doc = apply(
            [
                { type: 'tab.updateField', tabId: 't-1', field: 'label', value: 'Ny' },
                { type: 'tab.updateField', tabId: 't-1', field: 'dependent_question_ids_legacy', value: 'x' },
            ],
            scaffold(),
        )
        assert.equal(doc.tabsById?.['t-1']?.label, 'Ny')
        assert.equal(doc.tabsById?.['t-1']?.['dependent_question_ids_legacy'], 'x')
    })

    it('refuses a whole-snapshot write through every reserved spelling at the reducer', () => {
        for (const field of ['questionIds', 'rowCountQuestionIds', 'layout']) {
            throwsConflict(
                () => apply([{ type: 'tab.updateField', tabId: 't-1', field, value: 'anything' }], scaffold()),
                `"${field}" must be refused by the reducer, not only by the helper`,
            )
        }
    })
})

describe('question deletion scrubs all three tab locations', () => {
    it('removes the id from membership, count and layout across multiple tabs', () => {
        const base = apply(
            [
                { type: 'tab.create', tabId: 't-2', label: 'Andre' },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'q-top', include: true },
                { type: 'tab.setRowCountQuestion', tabId: 't-1', questionId: 'g-1', include: true },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'g-1', placement: { row: 0, cell: 0 } },
                { type: 'tab.setQuestion', tabId: 't-2', questionId: 'g-1', include: true },
                { type: 'tab.setRowCountQuestion', tabId: 't-2', questionId: 'g-1', include: true },
                { type: 'tab.setLayout', tabId: 't-2', questionId: 'g-1', placement: { row: 2, cell: 1 } },
            ],
            scaffold(),
        )

        const doc = apply([{ type: 'question.delete', questionId: 'g-1' }], base)
        // Left behind, each of the three would name a question the document no longer has —
        // unreachable state that still changes `document_hash`.
        assert.deepEqual(doc.tabsById?.['t-1']?.questionIds, ['q-top'])
        assert.equal('rowCountQuestionIds' in (doc.tabsById?.['t-1'] ?? {}), false)
        assert.equal('layout' in (doc.tabsById?.['t-1'] ?? {}), false)
        // The second tab is scrubbed too, and survives with nothing but its label.
        assert.deepEqual(doc.tabsById?.['t-2'], { label: 'Andre' })
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('scrubs a recursively deleted grid column from every tab location', () => {
        const base = apply(
            [
                { type: 'tab.setQuestion', tabId: 't-1', questionId: 'c-1', include: true },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'c-1', placement: { row: 0, cell: 3 } },
            ],
            scaffold(),
        )
        // `c-1` is deleted only as a consequence of its owning grid going, so the cascade has to run
        // for every id in the ownership subtree rather than just the one named in the op.
        const doc = apply([{ type: 'question.delete', questionId: 'g-1' }], base)
        assert.deepEqual(doc.tabsById?.['t-1'], { label: 'Første' })
    })
})

describe('tab.setLayout is not narrowed by the membership repair', () => {
    it('still places a question that is not a member, so v0.31 logs replay', () => {
        // A v0.31 log has no membership ops in it at all. Requiring membership here would make every
        // stored layout-only log unreplayable — the exact break DEC-006 forbids.
        const doc = apply(
            [{ type: 'tab.setLayout', tabId: 't-1', questionId: 'q-top', placement: { row: 1, cell: 2 } }],
            scaffold(),
        )
        assert.deepEqual(doc.tabsById?.['t-1']?.layout, {
            placementsByQuestionId: { 'q-top': { row: 1, cell: 2 } },
        })
        assert.equal('questionIds' in (doc.tabsById?.['t-1'] ?? {}), false)
    })

    it('produces a byte-identical tab to the one a v0.31 reducer produced', () => {
        // The v0.31 result for this log, recorded as literal bytes rather than recomputed: a canonical
        // form that moved would otherwise agree with itself and prove nothing.
        const doc = apply(
            [
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'q-top', placement: { row: 0, cell: 0 } },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'g-1', placement: { row: 1, cell: 1, keepCellSize: true } },
                { type: 'tab.setLayout', tabId: 't-1', questionId: 'q-top', placement: null },
            ],
            scaffold(),
        )
        assert.equal(
            canonicalJson(doc.tabsById?.['t-1']),
            '{"label":"Første","layout":{"placementsByQuestionId":{"g-1":{"cell":1,"keepCellSize":true,"row":1}}}}',
        )
    })
})

// ───────────────────────── AC-9: Expression formulas and Chart legends ─────────────────────────

/**
 * The AC-9 closed producers over two still-open released bags.
 *
 * `QnrQuestion.chart` and `QnrAlternative` stay open, so `question.updateField` and
 * `alternative.updateField` keep writing every one of these paths byte-for-byte — imported `pie`
 * content, truncated legacy tokens and malformed legend bags all remain readable and replayable. What
 * the four new operations add is a path that can only produce canonical state: publication, not replay,
 * is where the old shapes become findings.
 *
 * @see the AC-9 shared repair matrix — reducer laws and append-only split
 */

/** A radar Chart, an ExpressionQuestion, and two flagged targets legal to cite from either. */
const ac9 = (): QnrTemplateDocument =>
    apply([
        { type: 'question.create', questionId: 'ch-1', questionType: 'Chart' },
        { type: 'question.updateField', questionId: 'ch-1', field: 'chart.type', value: 'radar' },
        { type: 'alternative.create', questionId: 'ch-1', alternativeId: 'ca-1', label: 'Akse' },
        { type: 'question.create', questionId: 'ex-1', questionType: 'ExpressionQuestion' },
        { type: 'alternative.create', questionId: 'ex-1', alternativeId: 'ea-1', label: 'Formel' },
        { type: 'question.create', questionId: 'tg-1', questionType: 'RadioButtons' },
        { type: 'question.updateField', questionId: 'tg-1', field: 'flags.is_expression', value: true },
        { type: 'question.create', questionId: 'tg-2', questionType: 'LinearScale' },
        { type: 'question.updateField', questionId: 'tg-2', field: 'flags.is_expression', value: true },
        // Deliberately unflagged, and a Chart, so both refusal reasons are reachable.
        { type: 'question.create', questionId: 'tg-off', questionType: 'RadioButtons' },
        { type: 'question.create', questionId: 'ch-2', questionType: 'Chart' },
    ])

const alternative = (doc: QnrTemplateDocument, id: string) => doc.alternativesById?.[id]
const chart = (doc: QnrTemplateDocument, id = 'ch-1') =>
    doc.questionsById?.[id]?.['chart'] as Record<string, unknown> | undefined

describe('the canonical expression tokens', () => {
    it('is injective where legacy was not', () => {
        // Legacy tokenized the LAST EIGHT characters of an id, so these two ids collided and a formula
        // silently scored the wrong question. Guaranteed rather than unlucky after a bundle pick, where
        // every fresh id comes from one map.
        const a = 'q-1111111111-deadbeef'
        const b = 'q-2222222222-deadbeef'
        assert.equal(a.slice(-8), b.slice(-8))
        assert.notEqual(makeExpressionTargetToken(a), makeExpressionTargetToken(b))
    })

    it('encodes the complete id as lowercase UTF-8 hex and round-trips non-ASCII', () => {
        assert.equal(makeExpressionTargetToken('q1'), '<target_7131>')
        assert.equal(makeExpressionAlternativeToken('a1'), '<exp_6131>')
        // Two bytes per non-ASCII character, so a Unicode id is not lossy or ambiguous.
        assert.equal(makeExpressionTargetToken('æ'), '<target_c3a6>')
        assert.equal(makeExpressionTargetToken('æ'), makeExpressionTargetToken('æ'))
    })

    it('keeps the two token spaces disjoint', () => {
        assert.equal(isExpressionTargetToken(makeExpressionTargetToken('x')), true)
        assert.equal(isExpressionAlternativeToken(makeExpressionAlternativeToken('x')), true)
        // A target token is not an alternative token even for the same id.
        assert.equal(isExpressionAlternativeToken(makeExpressionTargetToken('x')), false)
        assert.equal(isExpressionTargetToken(makeExpressionAlternativeToken('x')), false)
    })

    it('refuses every non-canonical spelling, including the legacy one', () => {
        for (const value of [
            '<target_>',            // empty body
            '<target_713>',         // odd length: half a byte
            '<target_71G1>',        // non-hex
            '<target_71A1>',        // uppercase
            '<target_7131',         // unterminated
            'target_7131>',         // no opening delimiter
            '<target_7131>x',       // suffix claimant
            'x<target_7131>',       // prefix claimant
            '<target_deadbeef>_old',
            '<exp_7131>',
            '',
        ]) {
            assert.equal(isExpressionTargetToken(value), false, value)
        }
    })
})

describe('alternative.setExpressionFormula', () => {
    it('writes the formula and its ordered targets as one value', () => {
        const doc = apply(
            [
                {
                    type: 'alternative.setExpressionFormula',
                    questionId: 'ex-1',
                    alternativeId: 'ea-1',
                    value: `${makeExpressionTargetToken('tg-2')} + ${makeExpressionTargetToken('tg-1')}`,
                    expressionTargets: ['tg-2', 'tg-1'],
                },
            ],
            ac9(),
        )
        assert.equal(alternative(doc, 'ea-1')?.['value'], '<target_74672d32> + <target_74672d31>')
        // Authored order is preserved, not sorted: it is the order the author listed.
        assert.deepEqual(alternative(doc, 'ea-1')?.['expressionTargets'], ['tg-2', 'tg-1'])
    })

    it('omits an empty target list rather than storing []', () => {
        const doc = apply(
            [{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: '1 + 2', expressionTargets: [] }],
            ac9(),
        )
        assert.equal(alternative(doc, 'ea-1')?.['value'], '1 + 2')
        assert.equal('expressionTargets' in (alternative(doc, 'ea-1') ?? {}), false)
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('is draft-permissive: text and targets need not agree', () => {
        // A half-typed formula must save. Publication owns the mismatch finding; erasing or repairing it
        // here would delete what the author is in the middle of writing.
        assert.doesNotThrow(() =>
            apply(
                [{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: `${makeExpressionTargetToken('tg-1')} +`, expressionTargets: [] }],
                ac9(),
            ),
        )
        assert.doesNotThrow(() =>
            apply(
                [{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: '0', expressionTargets: ['tg-1'] }],
                ac9(),
            ),
        )
    })

    it('refuses a duplicate, missing, wrong-type, Chart or flag-off target', () => {
        const bad: Array<[string, string[]]> = [
            ['a duplicate target', ['tg-1', 'tg-1']],
            ['a missing target', ['ghost']],
            ['an unflagged target', ['tg-off']],
            ['a Chart target', ['ch-2']],
            ['a grid target', ['ex-1']],
        ]
        for (const [hint, expressionTargets] of bad) {
            throwsConflict(
                () => apply([{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: '0', expressionTargets }], ac9()),
                hint,
            )
        }
    })

    it('refuses a wrong owner type and an alternative of another question', () => {
        throwsConflict(
            () => apply([{ type: 'alternative.setExpressionFormula', questionId: 'ch-1', alternativeId: 'ca-1', value: '0', expressionTargets: [] }], ac9()),
            'only an ExpressionQuestion has a formula',
        )
        throwsConflict(
            () => apply([{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ca-1', value: '0', expressionTargets: [] }], ac9()),
            'the alternative must be owned by that exact question',
        )
    })

    it('is last-writer-wins on the whole value, and different alternatives converge', () => {
        const two = apply(
            [
                { type: 'alternative.create', questionId: 'ex-1', alternativeId: 'ea-2', label: 'Formel 2' },
                { type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: 'A', expressionTargets: ['tg-1'] },
                { type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-2', value: 'B', expressionTargets: ['tg-2'] },
                // The second write on ea-1 replaces the whole value: no stale target survives under it.
                { type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: 'C', expressionTargets: [] },
            ],
            ac9(),
        )
        assert.equal(alternative(two, 'ea-1')?.['value'], 'C')
        assert.equal('expressionTargets' in (alternative(two, 'ea-1') ?? {}), false)
        assert.equal(alternative(two, 'ea-2')?.['value'], 'B')
        assert.deepEqual(alternative(two, 'ea-2')?.['expressionTargets'], ['tg-2'])
    })
})

describe('chartLegend.create', () => {
    it('inserts the record and the order entry atomically, appending by default', () => {
        const doc = apply(
            [
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' },
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-2', label: 'Psykisk' },
            ],
            ac9(),
        )
        assert.deepEqual(chart(doc)?.['legendsById'], {
            'lg-1': { id: 'lg-1', label: 'Fysisk' },
            'lg-2': { id: 'lg-2', label: 'Psykisk' },
        })
        // A record with no order entry is unreachable state that still moves the hash; the reverse dangles.
        assert.deepEqual(chart(doc)?.['legendsOrder'], ['lg-1', 'lg-2'])
    })

    it('clamps atIndex, which is what makes a bundle pick lossless', () => {
        const base = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'A' }], ac9())
        const first = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-2', label: 'B', atIndex: 0 }], base)
        assert.deepEqual(chart(first)?.['legendsOrder'], ['lg-2', 'lg-1'])
        const clamped = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-3', label: 'C', atIndex: 99 }], first)
        assert.deepEqual(chart(clamped)?.['legendsOrder'], ['lg-2', 'lg-1', 'lg-3'])
    })

    it('refuses an empty id or label, a duplicate id, and a duplicate label', () => {
        const base = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' }], ac9())
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: '', label: 'X' }], base), 'empty id')
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-9', label: '' }], base), 'empty label')
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Annet' }], base), 'duplicate id')
        // Legacy compares labels by exact equality, and two same-labelled legends are
        // indistinguishable in the radar the author is looking at.
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-2', label: 'Fysisk' }], base), 'duplicate label')
    })

    it('refuses a non-Chart owner and a non-radar Chart', () => {
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ex-1', legendId: 'lg-1', label: 'A' }], ac9()), 'not a Chart')
        // `pie` is preserved on read but never authored: legacy's designer exposes no working Pie editor.
        const pie = apply([{ type: 'question.updateField', questionId: 'ch-2', field: 'chart.type', value: 'pie' }], ac9())
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-2', legendId: 'lg-1', label: 'A' }], pie), 'pie is not authorable')
        // An uppercase spelling is not a second authored vocabulary either.
        const upper = apply([{ type: 'question.updateField', questionId: 'ch-2', field: 'chart.type', value: 'RADAR' }], ac9())
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-2', legendId: 'lg-1', label: 'A' }], upper), 'RADAR is not radar')
    })
})

describe('chartLegend.delete', () => {
    const withLegends = () =>
        apply(
            [
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' },
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-2', label: 'Psykisk' },
                { type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } },
            ],
            ac9(),
        )

    it('removes the record and every order occurrence, and clears its owned assignments', () => {
        const doc = apply([{ type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'lg-1' }], withLegends())
        assert.deepEqual(chart(doc)?.['legendsById'], { 'lg-2': { id: 'lg-2', label: 'Psykisk' } })
        assert.deepEqual(chart(doc)?.['legendsOrder'], ['lg-2'])
        // The legacy effect: a legend that disappears stops appearing on alternatives.
        assert.equal('chartLegend' in (alternative(doc, 'ca-1') ?? {}), false)
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('prunes the emptied containers without deleting the Chart', () => {
        const doc = apply(
            [
                { type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'lg-1' },
                { type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'lg-2' },
            ],
            withLegends(),
        )
        assert.equal('legendsById' in (chart(doc) ?? {}), false)
        assert.equal('legendsOrder' in (chart(doc) ?? {}), false)
        // The Chart itself, and its authored type, survive an emptied legend collection.
        assert.deepEqual(chart(doc), { type: 'radar' })
        assert.equal(doc.questionsById?.['ch-1']?.type, 'Chart')
    })

    it('leaves an identically-named legend on another Chart alone', () => {
        // Imported ids do collide across questions, so the cascade is scoped by ownership rather than
        // by id — clearing another Chart's assignment would be data loss.
        const base = apply(
            [
                { type: 'question.updateField', questionId: 'ch-2', field: 'chart.type', value: 'radar' },
                { type: 'chartLegend.create', questionId: 'ch-2', legendId: 'lg-1', label: 'Fysisk' },
                { type: 'alternative.create', questionId: 'ch-2', alternativeId: 'ca-2', label: 'Akse' },
                { type: 'alternative.setChartLegend', questionId: 'ch-2', alternativeId: 'ca-2', chartLegend: { id: 'lg-1', questionIdMap: 'tg-2' } },
            ],
            withLegends(),
        )
        const before = canonicalJson({ chart: chart(base, 'ch-2'), assignment: alternative(base, 'ca-2') })

        const doc = apply([{ type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'lg-1' }], base)
        assert.equal(canonicalJson({ chart: chart(doc, 'ch-2'), assignment: alternative(doc, 'ca-2') }), before)
        assert.equal('chartLegend' in (alternative(doc, 'ca-1') ?? {}), false)
    })

    it('repairs imported non-radar state and refuses an unknown legend', () => {
        // Deletion deliberately does NOT require radar: a `pie` document carrying legends must be fixable.
        const pie = apply(
            [
                { type: 'question.updateField', questionId: 'ch-1', field: 'chart.type', value: 'pie' },
            ],
            withLegends(),
        )
        assert.doesNotThrow(() => apply([{ type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'lg-1' }], pie))
        throwsConflict(() => apply([{ type: 'chartLegend.delete', questionId: 'ch-1', legendId: 'ghost' }], withLegends()), 'unknown legend')
        throwsConflict(() => apply([{ type: 'chartLegend.delete', questionId: 'ex-1', legendId: 'lg-1' }], withLegends()), 'not a Chart')
    })
})

describe('alternative.setChartLegend', () => {
    const withLegend = () =>
        apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' }], ac9())

    it('derives the label from the owning legend and writes the whole value at once', () => {
        const doc = apply(
            [{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } }],
            withLegend(),
        )
        // The label is copied here, never taken from the client: one legend id must not carry two labels.
        assert.deepEqual(alternative(doc, 'ca-1')?.['chartLegend'], {
            id: 'lg-1',
            questionIdMap: 'tg-1',
            label: 'Fysisk',
        })
    })

    it('replaces the whole value and clears it entirely', () => {
        const base = apply(
            [
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-2', label: 'Psykisk' },
                { type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } },
            ],
            withLegend(),
        )
        const replaced = apply(
            [{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-2', questionIdMap: 'tg-2' } }],
            base,
        )
        // Three separate field writes could interleave into an id/target/label hybrid no author selected.
        assert.deepEqual(alternative(replaced, 'ca-1')?.['chartLegend'], {
            id: 'lg-2',
            questionIdMap: 'tg-2',
            label: 'Psykisk',
        })
        const cleared = apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: null }], replaced)
        assert.equal('chartLegend' in (alternative(cleared, 'ca-1') ?? {}), false)
        assert.deepEqual(findDocLawViolations(cleared), [])
    })

    it('refuses a missing legend, a missing target, a Chart target and an unflagged target', () => {
        for (const [hint, chartLegend] of [
            ['missing legend', { id: 'ghost', questionIdMap: 'tg-1' }],
            ['missing target', { id: 'lg-1', questionIdMap: 'ghost' }],
            ['Chart target', { id: 'lg-1', questionIdMap: 'ch-2' }],
            ['unflagged target', { id: 'lg-1', questionIdMap: 'tg-off' }],
        ] as const) {
            throwsConflict(
                () => apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend }], withLegend()),
                hint,
            )
        }
    })

    it('refuses a wrong owner and a non-radar Chart, but still clears them', () => {
        throwsConflict(
            () => apply([{ type: 'alternative.setChartLegend', questionId: 'ex-1', alternativeId: 'ea-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } }], withLegend()),
            'only a Chart carries an assignment',
        )
        throwsConflict(
            () => apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ea-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } }], withLegend()),
            'the alternative must belong to that Chart',
        )
        // Clearing must survive a non-radar owner so an imported dangling assignment is repairable.
        const pie = apply([{ type: 'question.updateField', questionId: 'ch-1', field: 'chart.type', value: 'pie' }], withLegend())
        assert.doesNotThrow(() =>
            apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: null }], pie),
        )
        throwsConflict(
            () => apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } }], pie),
            'a non-null assignment requires radar',
        )
    })

    it('refuses a client-supplied label at the schema', () => {
        // The compile-time half is in `typeContracts.ts`; this is the wire half.
        const validated = templateOpSchema({
            type: 'alternative.setChartLegend',
            questionId: 'ch-1',
            alternativeId: 'ca-1',
            chartLegend: { id: 'lg-1', questionIdMap: 'tg-1', label: 'Noe annet' },
        })
        assert.ok(validated instanceof type.errors, 'a client label must not validate')
    })
})

describe('AC-9 deletion cascades', () => {
    const bound = () =>
        apply(
            [
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' },
                { type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'tg-1' } },
                {
                    type: 'alternative.setExpressionFormula',
                    questionId: 'ex-1',
                    alternativeId: 'ea-1',
                    value: `${makeExpressionTargetToken('tg-1')} + ${makeExpressionTargetToken('tg-2')} + ${makeExpressionTargetToken('tg-1')}`,
                    expressionTargets: ['tg-1', 'tg-2'],
                },
            ],
            ac9(),
        )

    it('deleting a target scrubs the list, every token occurrence, and the Chart assignment', () => {
        const doc = apply([{ type: 'question.delete', questionId: 'tg-1' }], bound())
        assert.deepEqual(alternative(doc, 'ea-1')?.['expressionTargets'], ['tg-2'])
        // Replaced with `0` so the formula still reads as arithmetic; both occurrences go.
        assert.equal(alternative(doc, 'ea-1')?.['value'], '0 + <target_74672d32> + 0')
        assert.equal('chartLegend' in (alternative(doc, 'ca-1') ?? {}), false)
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('never substring-matches, so legacy text and other tokens are untouched', () => {
        // A legacy truncated token and arbitrary author prose are not this reducer's to rewrite.
        const legacy = apply(
            [{ type: 'alternative.updateField', questionId: 'ex-1', alternativeId: 'ea-1', field: 'value', value: '<target_74672d31 + tg-1 + <target_74672d3> + tg-1-total' }],
            bound(),
        )
        const doc = apply([{ type: 'question.delete', questionId: 'tg-1' }], legacy)
        assert.equal(alternative(doc, 'ea-1')?.['value'], '<target_74672d31 + tg-1 + <target_74672d3> + tg-1-total')
    })

    it('scrubs a recursively deleted grid column from a formula and an assignment', () => {
        const base = apply(
            [
                { type: 'question.create', questionId: 'g-x', questionType: 'QuestionGrid' },
                { type: 'gridColumn.create', questionId: 'g-x', columnQuestionId: 'gc-1', questionType: 'RadioButtons' },
                { type: 'question.updateField', questionId: 'gc-1', field: 'flags.is_expression', value: true },
                { type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: makeExpressionTargetToken('gc-1'), expressionTargets: ['gc-1'] },
                { type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' },
                { type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'gc-1' } },
            ],
            ac9(),
        )
        // The column dies only as a consequence of its grid going, so the cascade must run for the whole
        // ownership subtree rather than the one id the operation names.
        const doc = apply([{ type: 'question.delete', questionId: 'g-x' }], base)
        assert.equal('expressionTargets' in (alternative(doc, 'ea-1') ?? {}), false)
        assert.equal(alternative(doc, 'ea-1')?.['value'], '0')
        assert.equal('chartLegend' in (alternative(doc, 'ca-1') ?? {}), false)
    })

    it('deleting an alternative scrubs only its own canonical token from its own question', () => {
        const base = apply(
            [
                { type: 'question.updateField', questionId: 'ex-1', field: 'expression.base', value: `${makeExpressionAlternativeToken('ea-1')} + ${makeExpressionAlternativeToken('ea-2')}` },
                { type: 'alternative.create', questionId: 'ex-1', alternativeId: 'ea-2', label: 'To' },
                // Another question's formula mentioning the same alternative is not ours to rewrite.
                { type: 'question.create', questionId: 'ex-2', questionType: 'ExpressionQuestion' },
                { type: 'question.updateField', questionId: 'ex-2', field: 'expression.base', value: makeExpressionAlternativeToken('ea-1') },
            ],
            ac9(),
        )
        const doc = apply([{ type: 'alternative.delete', questionId: 'ex-1', alternativeId: 'ea-1' }], base)
        assert.equal((doc.questionsById?.['ex-1']?.['expression'] as Record<string, unknown>)['base'], ' + <exp_65612d32>')
        assert.equal((doc.questionsById?.['ex-2']?.['expression'] as Record<string, unknown>)['base'], '<exp_65612d31>')
    })

    it('prunes the emptied expression bag rather than leaving an empty string', () => {
        const base = apply(
            [{ type: 'question.updateField', questionId: 'ex-1', field: 'expression.base', value: makeExpressionAlternativeToken('ea-1') }],
            ac9(),
        )
        const doc = apply([{ type: 'alternative.delete', questionId: 'ex-1', alternativeId: 'ea-1' }], base)
        assert.equal('expression' in (doc.questionsById?.['ex-1'] ?? {}), false)
        assert.deepEqual(findDocLawViolations(doc), [])
    })

    it('leaves a legacy noncanonical token alone when its alternative goes', () => {
        const base = apply(
            [{ type: 'question.updateField', questionId: 'ex-1', field: 'expression.base', value: '<exp_65612d31 + <exp_deadbeef>' }],
            ac9(),
        )
        const doc = apply([{ type: 'alternative.delete', questionId: 'ex-1', alternativeId: 'ea-1' }], base)
        // Publication reports it; the reducer does not guess which legacy token meant this alternative.
        assert.equal((doc.questionsById?.['ex-1']?.['expression'] as Record<string, unknown>)['base'], '<exp_65612d31 + <exp_deadbeef>')
    })
})

describe('the AC-9 released bags are not narrowed', () => {
    it('still writes every new path through the old updateField ops', () => {
        // The append-only pattern: `question.updateField`/`alternative.updateField` keep working on
        // exactly the paths the typed ops now own, so v0.31 logs replay unchanged.
        const doc = apply(
            [
                { type: 'question.updateField', questionId: 'ch-1', field: 'chart.legendRange.min', value: 0 },
                { type: 'question.updateField', questionId: 'ch-1', field: 'chart.newIndicator', value: 'buffer' },
                { type: 'alternative.updateField', questionId: 'ex-1', alternativeId: 'ea-1', field: 'value', value: 'legacy formula' },
                { type: 'alternative.updateField', questionId: 'ch-1', alternativeId: 'ca-1', field: 'chartLegend', value: 'not even an object' },
            ],
            ac9(),
        )
        assert.equal(alternative(doc, 'ea-1')?.['value'], 'legacy formula')
        assert.equal(alternative(doc, 'ca-1')?.['chartLegend'], 'not even an object')
        assert.equal(chart(doc)?.['newIndicator'], 'buffer')
        // Readable and valid: a stored UI buffer is refused by publication, not by the reducer.
        const validated = validateTemplateDocument(doc)
        assert.ok(validated.ok, validated.ok ? '' : validated.summary)
    })

    it('keeps an imported pie/unknown chart and a malformed legend bag readable', () => {
        const doc = apply(
            [
                { type: 'question.updateField', questionId: 'ch-2', field: 'chart.type', value: 'pie' },
                { type: 'question.updateField', questionId: 'ch-2', field: 'chart.legendsById', value: 'malformed' },
            ],
            ac9(),
        )
        const validated = validateTemplateDocument(doc)
        assert.ok(validated.ok, validated.ok ? '' : validated.summary)
        // …and none of it becomes writable through the typed path.
        throwsConflict(() => apply([{ type: 'chartLegend.create', questionId: 'ch-2', legendId: 'lg-1', label: 'A' }], doc), 'pie stays read-only')
    })

    it('replays a v0.31 alternative.updateField log to byte-identical bytes', () => {
        const doc = apply(
            [
                { type: 'alternative.updateField', questionId: 'ex-1', alternativeId: 'ea-1', field: 'value', value: '<target_deadbeef>' },
                { type: 'alternative.updateField', questionId: 'ex-1', alternativeId: 'ea-1', field: 'expressionTargets', value: ['tg-1'] },
            ],
            ac9(),
        )
        assert.equal(canonicalJson(alternative(doc, 'ea-1')), '{"expressionTargets":["tg-1"],"label":"Formel","value":"<target_deadbeef>"}')
    })
})

// ───────── survivor closure: cases the first mutation pass reached for the wrong reason ─────────

/**
 * Eight seeded mutants survived the first pass, and every one exposed a fixture that passed for a
 * reason other than the one it claimed. They are collected here because each needs a *specific* input
 * the happy-path fixtures do not produce — a flags bag that exists but is off, a Chart that is a legal
 * target except for its type, a payload that reaches the reducer without passing the schema.
 */
describe('the target gate refuses for the stated reason, not an incidental one', () => {
    /** The `ac9` fixture's unflagged target has no `flags` bag at all, so the bag guard caught it and
     *  the `is_expression === true` check was never the thing doing the work. */
    const withFlagBags = () =>
        apply(
            [
                { type: 'question.create', questionId: 'tg-false', questionType: 'RadioButtons' },
                { type: 'question.updateField', questionId: 'tg-false', field: 'flags.is_expression', value: false },
                { type: 'question.create', questionId: 'tg-other', questionType: 'RadioButtons' },
                { type: 'question.updateField', questionId: 'tg-other', field: 'flags.small_size', value: true },
                // A Chart that would otherwise qualify: the flag IS on, so only the type excludes it.
                { type: 'question.updateField', questionId: 'ch-2', field: 'flags.is_expression', value: true },
            ],
            ac9(),
        )

    it('refuses a target whose flag is present but not true', () => {
        // `flags.is_expression: false` and a flags bag with unrelated members are both "flag off" —
        // and both must be refused by the value check rather than by the bag being absent.
        for (const questionId of ['tg-false', 'tg-other']) {
            throwsConflict(
                () => apply([{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: '0', expressionTargets: [questionId] }], withFlagBags()),
                `"${questionId}" has a flags bag but no true is_expression`,
            )
        }
    })

    it('refuses a Chart target even when its is_expression flag is on', () => {
        // A chart scoring a chart is the cycle legacy never allowed, so the TYPE must exclude it
        // independently of the flag.
        throwsConflict(
            () => apply([{ type: 'alternative.setExpressionFormula', questionId: 'ex-1', alternativeId: 'ea-1', value: '0', expressionTargets: ['ch-2'] }], withFlagBags()),
            'a flagged Chart is still not a target',
        )
        const legend = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' }], withFlagBags())
        throwsConflict(
            () => apply([{ type: 'alternative.setChartLegend', questionId: 'ch-1', alternativeId: 'ca-1', chartLegend: { id: 'lg-1', questionIdMap: 'ch-2' } }], legend),
            'a flagged Chart is still not an assignment target',
        )
    })
})

describe('the Chart assignment label is derived even on a replayed op', () => {
    it('ignores a label that reached the reducer without passing the schema', () => {
        // The reducer is reachable without the validator: bunjs replays a stored `collab_ops` log
        // directly. So the schema refusing a client label is not sufficient — the reducer must derive it
        // regardless, or one legend id ends up carrying two labels and therefore two document hashes.
        const base = apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' }], ac9())
        const replayed = {
            type: 'alternative.setChartLegend',
            questionId: 'ch-1',
            alternativeId: 'ca-1',
            chartLegend: { id: 'lg-1', questionIdMap: 'tg-1', label: 'Noe klienten fant på' },
        } as unknown as TemplateOp

        const doc = apply([replayed], base)
        assert.deepEqual(alternative(doc, 'ca-1')?.['chartLegend'], {
            id: 'lg-1',
            questionIdMap: 'tg-1',
            label: 'Fysisk',
        })
    })
})

describe('alternative.delete rewrites only its own owner formula', () => {
    it('does nothing when the owning question has no base formula, even if another question does', () => {
        // The owner is looked up by id. Scanning for "the first question with a base" would rewrite a
        // formula belonging to someone else — invisible while the owner happens to be found first.
        const base = apply(
            [
                // A distinguishing member on the owner. Without it the two ExpressionQuestions are
                // structurally identical once the base is stripped — and because the helper writes its
                // result back to the OWNER's key, reading the wrong question produced a document equal
                // to the right one. That is exactly how this mutant survived the first pass.
                { type: 'question.updateField', questionId: 'ex-1', field: 'label', value: 'Eier' },
                { type: 'question.create', questionId: 'ex-2', questionType: 'ExpressionQuestion' },
                { type: 'question.updateField', questionId: 'ex-2', field: 'label', value: 'Annen' },
                { type: 'question.updateField', questionId: 'ex-2', field: 'expression.base', value: makeExpressionAlternativeToken('ea-1') },
                { type: 'alternative.create', questionId: 'ex-2', alternativeId: 'ea-2', label: 'To' },
            ],
            ac9(),
        )
        // `ex-1` owns `ea-1` and carries NO base; `ex-2` carries a base citing `ea-1`.
        assert.equal('expression' in (base.questionsById?.['ex-1'] ?? {}), false)

        const doc = apply([{ type: 'alternative.delete', questionId: 'ex-1', alternativeId: 'ea-1' }], base)
        assert.equal(
            (doc.questionsById?.['ex-2']?.['expression'] as Record<string, unknown>)['base'],
            '<exp_65612d31>',
        )
        // The owner is untouched ENTIRELY — not merely still base-less.
        assert.deepEqual(doc.questionsById?.['ex-1'], { type: 'ExpressionQuestion', label: 'Eier' })
        assert.equal(doc.questionsById?.['ex-2']?.label, 'Annen')
    })
})

describe('the alternative token recognizer enforces the same exact grammar as the target one', () => {
    it('refuses uppercase, odd-length, empty and claimant spellings', () => {
        for (const value of [
            '<exp_65612D31>',   // uppercase
            '<exp_6561231>',    // odd length
            '<exp_>',           // empty body
            '<exp_65G1>',       // non-hex
            '<exp_6561',        // unterminated
            'x<exp_6561>',      // prefix claimant
            '<exp_6561>x',      // suffix claimant
            '<target_6561>',    // the other token space
        ]) {
            assert.equal(isExpressionAlternativeToken(value), false, value)
        }
        assert.equal(isExpressionAlternativeToken(makeExpressionAlternativeToken('ea-1')), true)
    })
})

describe('the tab document members are typed, not admitted by the open index', () => {
    it('refuses an array of objects and a non-string member for both lists', () => {
        // The tab bag keeps its open `[string]: unknown` index, so leaving these members untyped would
        // silently admit exactly the array-of-objects shape DOC-LAW-1 exists to prevent.
        for (const [member, value] of [
            ['questionIds', [{ questionId: 'q-1' }]],
            ['questionIds', [1, 2]],
            ['rowCountQuestionIds', [{ questionId: 'g-1' }]],
            ['rowCountQuestionIds', 'g-1'],
        ] as const) {
            const doc = {
                documentId: 'tpl-schema',
                revision: 0,
                questionOrder: [],
                tabsById: { 't-1': { label: 'Fane', [member]: value } },
            }
            const validated = validateTemplateDocument(doc as never)
            assert.equal(validated.ok, false, `${member} = ${JSON.stringify(value)} must not validate`)
        }
    })

    it('still validates the legal primitive-id arrays and an unrelated open member', () => {
        const validated = validateTemplateDocument({
            documentId: 'tpl-schema',
            revision: 0,
            questionOrder: [],
            tabsById: { 't-1': { label: 'Fane', questionIds: ['q-1'], rowCountQuestionIds: ['g-1'], legacyBag: { a: 1 } } },
        } as never)
        assert.ok(validated.ok, validated.ok ? '' : validated.summary)
    })
})

// ───────── the admissible target vocabulary, pinned exhaustively in both directions ─────────

/**
 * `EXPRESSION_TARGET_TYPES` is a hand-maintained opt-in literal, and the type system can only check
 * that its members *are* question types — never that they are the *right* ones.
 *
 * That gap was measured: dropping four of the six admissible types, widening the list with a scalar
 * `TextShort`, or widening it with `ExpressionQuestion` all left the suite green. Dropping a type
 * silently refuses a legitimate authored target forever; widening makes a non-selectable question a
 * legal score target, which is the "non-selectable target" the frozen matrix names.
 *
 * So the vocabulary is pinned here, exhaustively over the whole shared register: every admissible type
 * must be ACCEPTED and every other type in `QUESTION_TYPES` must be REFUSED. Enumerating the
 * complement rather than a hand-picked sample is deliberate — adding a question type to the shared
 * register then forces a decision here instead of silently defaulting either way.
 */
describe('the Expression/Chart target vocabulary', () => {
    const ADMISSIBLE: readonly QuestionType[] = [
        'BooleanQuestion',
        'CheckBoxes',
        'Dropdown',
        'Emoticons',
        'LinearScale',
        'RadioButtons',
    ]
    const REFUSED = QUESTION_TYPES.filter((type) => !ADMISSIBLE.includes(type))

    /** One flagged question of `type`, so `flags.is_expression` can never be the reason for a refusal. */
    const withTarget = (type: QuestionType) =>
        apply(
            [
                { type: 'question.create', questionId: 'target', questionType: type },
                { type: 'question.updateField', questionId: 'target', field: 'flags.is_expression', value: true },
            ],
            ac9(),
        )

    const setFormula: TemplateOp = {
        type: 'alternative.setExpressionFormula',
        questionId: 'ex-1',
        alternativeId: 'ea-1',
        value: '0',
        expressionTargets: ['target'],
    }

    it('admits exactly the six selectable-or-LinearScale types', () => {
        // This direction catches a DROPPED member: the refusal-only tests cannot.
        for (const type of ADMISSIBLE) {
            assert.doesNotThrow(() => apply([setFormula], withTarget(type)), `${type} must be admitted as a target`)
        }
    })

    it('refuses every other type in the shared register', () => {
        // Each is created WITH the flag on, so only the type list can be doing the refusing.
        assert.ok(REFUSED.length > 0, 'the complement must be non-empty or this test is vacuous')
        for (const type of REFUSED) {
            throwsConflict(() => apply([setFormula], withTarget(type)), `${type} must be refused as a target`)
        }
    })

    it('applies the same vocabulary to a Chart assignment target', () => {
        // One gate, two operations: a type legal for a formula must be legal for an assignment and
        // vice-versa, or the two paths would drift into two different vocabularies.
        const assignment = (): TemplateOp => ({
            type: 'alternative.setChartLegend',
            questionId: 'ch-1',
            alternativeId: 'ca-1',
            chartLegend: { id: 'lg-1', questionIdMap: 'target' },
        })
        const withLegend = (type: QuestionType) =>
            apply([{ type: 'chartLegend.create', questionId: 'ch-1', legendId: 'lg-1', label: 'Fysisk' }], withTarget(type))

        for (const type of ADMISSIBLE) {
            assert.doesNotThrow(() => apply([assignment()], withLegend(type)), `${type} must be an assignment target`)
        }
        for (const type of REFUSED) {
            throwsConflict(() => apply([assignment()], withLegend(type)), `${type} must not be an assignment target`)
        }
    })

    it('covers the whole register, so a new question type cannot slip past undecided', () => {
        assert.equal(ADMISSIBLE.length + REFUSED.length, QUESTION_TYPES.length)
        // Every admissible type is a real member of the shared register, not a typo.
        for (const type of ADMISSIBLE) assert.ok(QUESTION_TYPES.includes(type), `${type} is not a QuestionType`)
    })
})
