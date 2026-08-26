import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyOperation, OperationConflictError, knownActionFieldRefusal, tabFieldPathRefusal } from './applyOperation.js'
import { canonicalJson, reduceToMinimalForm } from './canonicalize.js'
import { findDocLawViolations } from './docLaws.js'
import type { TemplateOp } from './operations.js'
import { templateDocumentIsDefault, templateOpSchema, validateTemplateDocument } from './schemas.js'
import {
    emptyTemplateDocument,
    isKnownActionKind,
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
