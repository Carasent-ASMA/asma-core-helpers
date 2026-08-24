import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type } from 'arktype'

import {
    applyOperation,
    knownActionFieldRefusal,
    knownActionValueRefusal,
    OperationConflictError,
} from './applyOperation.js'
import type { TemplateOp } from './operations.js'
import { templateOpSchema } from './schemas.js'
import { emptyTemplateDocument, type ActionMetadata, type QnrTemplateDocument } from './templateDocument.js'

/**
 * The hardening pass over ASMA-7683's typed authoring surface.
 *
 * Every case here corresponds to a hole that was **reproduced at `7e90b14`** before being closed. They
 * share one theme worth stating: the wire schema is not the only way into the reducer. bunjs replays a
 * stored `collab_ops` log without re-validating each op, so anything the reducer alone permits is
 * reachable by an op written by an older or bypassed client — and unlike a rejected request, it lands
 * in a document and then in an immutable artifact.
 *
 * The other theme is closed-by-default: a KNOWN action's shape is finite, so an unlisted field must be
 * refused rather than tolerated. `QnrAction` stays open for LEGACY records precisely so the typed path
 * can be strict.
 */

const doc0 = emptyTemplateDocument('tpl-harden')
const apply = (ops: TemplateOp[], from: QnrTemplateDocument = doc0): QnrTemplateDocument =>
    ops.reduce((doc, op) => applyOperation(doc, op), from)
const throwsConflict = (fn: () => unknown, hint: string) =>
    assert.throws(fn, (error: unknown) => error instanceof OperationConflictError, hint)

const scaffold = (): QnrTemplateDocument =>
    apply([
        { type: 'question.create', questionId: 'g-1', questionType: 'QuestionGrid' },
        { type: 'gridColumn.create', questionId: 'g-1', columnQuestionId: 'c-1', questionType: 'TextShort' },
        { type: 'question.create', questionId: 'g-2', questionType: 'QuestionGrid' },
        { type: 'gridColumn.create', questionId: 'g-2', columnQuestionId: 'c-2', questionType: 'TextShort' },
        { type: 'mappingNode.create', nodeId: 'n-1', entityId: 'Actor' },
    ])

const action = (doc: QnrTemplateDocument, id: string) => doc.actionsById?.[id]

// ─────────────────────────── compile-time closure (the probes) ───────────────────────────

describe('the typed unions are closed at compile time', () => {
    it('is enforced by src/collaboration/typeContracts.ts, not from here', () => {
        // Stated rather than implied: `tsconfig.json` excludes `**/*.test.ts` from `ts:check`, and the
        // test runner strips types without checking them — so a `@ts-expect-error` written HERE is
        // evaluated by nothing and reads as a guarantee it cannot give. The real assertions live in a
        // checked module, where reopening either union turns `pnpm ts:check` red.
        //
        // What is still worth asserting at runtime is that the two legal shapes behave, which the
        // wire-schema and reducer suites below do.
        assert.ok(true)
    })
})

// ─────────────────────────── the wire schema ───────────────────────────

describe('the wire schema discriminates createTyped', () => {
    it('refuses actionType on a topLevelAction', () => {
        const refused = templateOpSchema({
            type: 'action.createTyped',
            actionId: 'x',
            kind: 'topLevelAction',
            actionType: 'COPY',
        })

        assert.ok(refused instanceof type.errors)
    })

    it('still accepts both legal shapes', () => {
        for (const op of [
            { type: 'action.createTyped', actionId: 'x', kind: 'topLevelAction', label: 'Kjør' },
            { type: 'action.createTyped', actionId: 'x', kind: 'gridAction', actionType: 'UPDATE' },
        ]) {
            assert.equal(templateOpSchema(op) instanceof type.errors, false, JSON.stringify(op))
        }
    })

    it('refuses an invalid actionType on the gridAction arm', () => {
        const refused = templateOpSchema({
            type: 'action.createTyped',
            actionId: 'x',
            kind: 'gridAction',
            actionType: 'DELETE',
        })

        assert.ok(refused instanceof type.errors)
    })
})

// ─────────────────────────── known-action field whitelist ───────────────────────────

describe('action.updateField on a known action is closed by a whitelist', () => {
    const known = (kind: 'topLevelAction' | 'gridAction') =>
        apply([{ type: 'action.createTyped', actionId: 'x-k', kind } as TemplateOp], scaffold())

    it('refuses a field that is simply not in the vocabulary', () => {
        // The blacklist this replaced enumerated forbidden names, so `arbitraryField` persisted and
        // turned a typed record back into the broad legacy bag.
        for (const field of ['arbitraryField', 'nested.thing', 'questionId', 'childActionOrder']) {
            assert.notEqual(knownActionFieldRefusal('gridAction', field), undefined, field)
            throwsConflict(
                () => apply([{ type: 'action.updateField', actionId: 'x-k', field, value: 'x' }], known('gridAction')),
                field,
            )
        }
    })

    it('permits exactly label on both kinds, and actionType only on a gridAction', () => {
        assert.equal(knownActionFieldRefusal('topLevelAction', 'label'), undefined)
        assert.equal(knownActionFieldRefusal('gridAction', 'label'), undefined)
        assert.equal(knownActionFieldRefusal('gridAction', 'actionType'), undefined)
        assert.notEqual(knownActionFieldRefusal('topLevelAction', 'actionType'), undefined)

        const doc = apply(
            [
                { type: 'action.updateField', actionId: 'x-k', field: 'label', value: 'Ny' },
                { type: 'action.updateField', actionId: 'x-k', field: 'actionType', value: 'UPDATE' },
            ],
            known('gridAction'),
        )
        assert.deepEqual(action(doc, 'x-k'), { kind: 'gridAction', label: 'Ny', actionType: 'UPDATE' })
    })

    it('explains WHICH rule refused, not merely that something did', () => {
        // With a whitelist, every unlisted field is refused regardless — so these tailored messages are
        // the only thing distinguishing "write-once", "UI buffer" and "reserved for a dedicated op" from
        // a generic rejection. Asserted because an author acts on the reason: re-create the action,
        // stop sending a designer flag, or use `setMetadata` instead.
        assert.match(knownActionFieldRefusal('gridAction', 'kind') ?? '', /write-once/)
        assert.match(knownActionFieldRefusal('gridAction', 'editable_label') ?? '', /UI edit buffer/)
        assert.match(knownActionFieldRefusal('topLevelAction', 'actionType') ?? '', /belongs to a gridAction/)
        assert.match(knownActionFieldRefusal('gridAction', 'metadataByQuestionId') ?? '', /typed action operations/)
        assert.match(knownActionFieldRefusal('gridAction', 'metadataByQuestionId.c-1') ?? '', /typed action operations/)
        // And the catch-all names what IS writable, so the next attempt can succeed.
        assert.match(knownActionFieldRefusal('topLevelAction', 'arbitraryField') ?? '', /writable: label/)
    })

    it('validates the VALUE, so a permitted field cannot be written malformed', () => {
        assert.notEqual(knownActionValueRefusal('actionType', 'DELETE'), undefined)
        assert.notEqual(knownActionValueRefusal('label', 42), undefined)
        assert.equal(knownActionValueRefusal('label', 'Ny'), undefined)
        assert.equal(knownActionValueRefusal('actionType', 'COPY'), undefined)
        // `null` is the op layer's explicit unset and stays legal for both.
        assert.equal(knownActionValueRefusal('label', null), undefined)
        assert.equal(knownActionValueRefusal('actionType', null), undefined)

        for (const [field, value] of [['actionType', 'DELETE'], ['label', 42]] as const) {
            throwsConflict(
                () => apply([{ type: 'action.updateField', actionId: 'x-k', field, value }], known('gridAction')),
                `${field}=${String(value)}`,
            )
        }

        // And the unset still works, leaving minimal form behind.
        const cleared = apply(
            [
                { type: 'action.updateField', actionId: 'x-k', field: 'label', value: 'Ny' },
                { type: 'action.updateField', actionId: 'x-k', field: 'label', value: null },
            ],
            known('gridAction'),
        )
        assert.deepEqual(action(cleared, 'x-k'), { kind: 'gridAction' })
    })

    it('leaves LEGACY unknown-kind records completely unrestricted', () => {
        // The compatibility half: the whitelist must not reach a record it was not written for.
        const legacy = apply([{ type: 'action.create', actionId: 'x-l', kind: 'submit' }], scaffold())
        const doc = apply(
            [
                { type: 'action.updateField', actionId: 'x-l', field: 'arbitraryField', value: 'x' },
                { type: 'action.updateField', actionId: 'x-l', field: 'editable_label', value: true },
                { type: 'action.updateField', actionId: 'x-l', field: 'actionType', value: 'DELETE' },
                { type: 'action.updateField', actionId: 'x-l', field: 'label', value: 42 },
            ],
            legacy,
        )

        assert.deepEqual(action(doc, 'x-l'), {
            kind: 'submit',
            arbitraryField: 'x',
            editable_label: true,
            actionType: 'DELETE',
            label: 42,
        })
    })
})

// ─────────────────────────── gridColumn.setAction kind check ───────────────────────────

describe('a grid may only own a known gridAction', () => {
    it('refuses a topLevelAction and an unknown legacy action on include', () => {
        const base = apply(
            [
                { type: 'action.createTyped', actionId: 'x-top', kind: 'topLevelAction' },
                { type: 'action.create', actionId: 'x-legacy', kind: 'submit' },
            ],
            scaffold(),
        )

        for (const actionId of ['x-top', 'x-legacy']) {
            throwsConflict(
                () => apply([{ type: 'gridColumn.setAction', questionId: 'g-1', actionId, include: true }], base),
                actionId,
            )
        }
    })

    it('still scrubs a malformed or legacy reference on include:false', () => {
        // Removal must stay possible, or a document that already holds a bad reference is unfixable.
        const malformed = {
            ...scaffold(),
            actionsById: { 'x-legacy': { kind: 'submit' } },
        } as unknown as QnrTemplateDocument
        const withRef = {
            ...malformed,
            questionsById: {
                ...malformed.questionsById,
                'g-1': {
                    ...(malformed.questionsById?.['g-1'] as object),
                    presentation: { actionIds: ['x-legacy'] },
                },
            },
        } as unknown as QnrTemplateDocument

        const repaired = apply(
            [{ type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-legacy', include: false }],
            withRef,
        )

        assert.equal(repaired.questionsById?.['g-1']?.presentation, undefined)
    })

    it('keeps one-owner enforcement', () => {
        const base = apply(
            [
                { type: 'action.createTyped', actionId: 'x-g', kind: 'gridAction' },
                { type: 'gridColumn.setAction', questionId: 'g-1', actionId: 'x-g', include: true },
            ],
            scaffold(),
        )

        throwsConflict(
            () => apply([{ type: 'gridColumn.setAction', questionId: 'g-2', actionId: 'x-g', include: true }], base),
            'second owner',
        )
    })
})

// ─────────────────────────── setMetadata owner disambiguation ───────────────────────────

describe('action.setMetadata does not depend on key order', () => {
    /** A malformed imported document: ONE grid action listed by TWO grids, in a chosen key order. */
    const twoOwners = (order: 'g1first' | 'g2first'): QnrTemplateDocument => {
        const g1 = { type: 'QuestionGrid', grid: { columnIds: ['c-1'] }, presentation: { actionIds: ['x-g'] } }
        const g2 = { type: 'QuestionGrid', grid: { columnIds: ['c-2'] }, presentation: { actionIds: ['x-g'] } }
        const c1 = { type: 'TextShort' }
        const c2 = { type: 'TextShort' }

        return {
            documentId: 'tpl-two-owners',
            revision: 1,
            questionOrder: ['g-1', 'g-2'],
            questionsById:
                order === 'g1first'
                    ? { 'g-1': g1, 'g-2': g2, 'c-1': c1, 'c-2': c2 }
                    : { 'g-2': g2, 'g-1': g1, 'c-1': c1, 'c-2': c2 },
            actionsById: { 'x-g': { kind: 'gridAction' } },
        } as unknown as QnrTemplateDocument
    }

    it('refuses ambiguous metadata whichever grid appears first', () => {
        // The defect: resolving the column vocabulary from `owners[0]` made this write succeed on one
        // key order and fail on the other — two documents with identical content disagreeing, which is
        // the failure DOC-LAW-1 exists to prevent.
        for (const order of ['g1first', 'g2first'] as const) {
            throwsConflict(
                () =>
                    apply(
                        [{ type: 'action.setMetadata', actionId: 'x-g', questionId: 'c-1', metadata: { all: true } }],
                        twoOwners(order),
                    ),
                order,
            )
        }
    })

    it('names the ambiguity rather than a missing column', () => {
        let message = ''
        try {
            apply(
                [{ type: 'action.setMetadata', actionId: 'x-g', questionId: 'c-1', metadata: { all: true } }],
                twoOwners('g1first'),
            )
        } catch (error) {
            message = error instanceof Error ? error.message : ''
        }

        assert.match(message, /owned by 2 grids/)
        // Sorted, so the message itself does not reintroduce key-order dependence.
        assert.match(message, /g-1, g-2/)
    })

    it('lets metadata:null repair an UNOWNED record', () => {
        // Removal needs no owner: requiring one would make exactly the malformed documents that need
        // fixing unfixable.
        const unowned = {
            documentId: 'tpl-unowned',
            revision: 1,
            questionOrder: [],
            actionsById: { 'x-g': { kind: 'gridAction', metadataByQuestionId: { 'c-1': { all: true } } } },
        } as unknown as QnrTemplateDocument

        const repaired = apply(
            [{ type: 'action.setMetadata', actionId: 'x-g', questionId: 'c-1', metadata: null }],
            unowned,
        )

        assert.deepEqual(action(repaired, 'x-g'), { kind: 'gridAction' })
    })

    it('still requires the action itself to be a known gridAction, even for null', () => {
        const legacy = apply([{ type: 'action.create', actionId: 'x-l', kind: 'submit' }], scaffold())

        throwsConflict(
            () => apply([{ type: 'action.setMetadata', actionId: 'x-l', questionId: 'c-1', metadata: null }], legacy),
            'legacy record is not a known gridAction',
        )
    })
})

// ─────────────────────────── direct replay of setTyped ───────────────────────────

describe('mappingFilter.setTyped is validated in the reducer, not only at the wire', () => {
    const replay = (payload: Record<string, unknown>) =>
        apply(
            [{ type: 'mappingFilter.setTyped', filterId: 'f-1', nodeId: 'n-1', fieldId: 'Navn', ...payload } as unknown as TemplateOp],
            scaffold(),
        )

    it('refuses every malformed payload that bypassed the wire', () => {
        const cases: Array<[string, Record<string, unknown>]> = [
            ['an empty in-list', { operator: 'in', values: [] }],
            ['a range with no bound', { operator: 'range' }],
            ['a non-boolean isNull', { operator: 'isNull', value: 'yes' }],
            ['eq with no value', { operator: 'eq' }],
            ['eq with a non-scalar value', { operator: 'eq', value: { a: 1 } }],
            ['an in-list holding a non-scalar', { operator: 'in', values: ['a', { b: 2 }] }],
            ['a range bound that is not a scalar', { operator: 'range', from: { a: 1 } }],
            ['eq carrying a stale values member', { operator: 'eq', value: 'a', values: ['b'] }],
            ['in carrying a stale value member', { operator: 'in', values: ['b'], value: 'a' }],
            ['range carrying a stale value member', { operator: 'range', from: 1, value: 'a' }],
            ['isNull carrying a stale range bound', { operator: 'isNull', value: true, to: 3 }],
        ]

        for (const [hint, payload] of cases) {
            throwsConflict(() => replay(payload), hint)
        }
    })

    it('refuses an unknown operator instead of storing it as a boundless range', () => {
        // The worst of the set: `weird` fell past the eq/in/isNull tests into the range branch and was
        // written as `{operator: 'range'}` with no bounds — a filter nothing can evaluate, bound for an
        // artifact that is immutable forever.
        for (const operator of ['weird', 'contains', 'startsWith', '']) {
            throwsConflict(() => replay({ operator, value: 'x' }), operator || '(empty)')
        }

        let message = ''
        try {
            replay({ operator: 'contains', value: 'x' })
        } catch (error) {
            message = error instanceof Error ? error.message : ''
        }
        // The message points at the compatible path rather than just refusing.
        assert.match(message, /mappingFilter\.set/)
    })

    it('still accepts every legal payload and replaces canonically', () => {
        const legal: Array<[Record<string, unknown>, Record<string, unknown>]> = [
            [{ operator: 'eq', value: 'ada' }, { fieldId: 'Navn', operator: 'eq', value: 'ada' }],
            [{ operator: 'in', values: ['a', 2, true] }, { fieldId: 'Navn', operator: 'in', values: ['a', 2, true] }],
            [{ operator: 'range', from: 1 }, { fieldId: 'Navn', operator: 'range', from: 1 }],
            [{ operator: 'range', to: 9 }, { fieldId: 'Navn', operator: 'range', to: 9 }],
            [{ operator: 'range', from: 1, to: 9 }, { fieldId: 'Navn', operator: 'range', from: 1, to: 9 }],
            [{ operator: 'isNull', value: false }, { fieldId: 'Navn', operator: 'isNull', value: false }],
        ]

        for (const [payload, expected] of legal) {
            assert.deepEqual(replay(payload).mappingFiltersById?.['f-1'], expected, JSON.stringify(payload))
        }
    })

    it('leaves the legacy mappingFilter.set path untouched', () => {
        // The compatibility guarantee: the loose op still writes an operator the typed path refuses.
        const doc = apply(
            [{ type: 'mappingFilter.set', filterId: 'f-1', nodeId: 'n-1', fieldId: 'Navn', operator: 'contains', value: 'ada' }],
            scaffold(),
        )

        assert.deepEqual(doc.mappingFiltersById?.['f-1'], { fieldId: 'Navn', operator: 'contains', value: 'ada' })
    })
})
