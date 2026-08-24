import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { QnrQuestionBundle } from './templateDocument.js'

/**
 * The bundle's order contract (OQ-V2-1, ASMA-7683 AC-5).
 *
 * A `QnrQuestionBundle` is stored whole in `qnr_question_templates.bundle`, a **`jsonb`** column, and
 * a pick replays it as ordinary authoring ops. `tab.create` appends, so the order the pick emits tabs
 * in *is* the order they take in the live template's tab bar. That makes "which order were these tabs
 * authored in" a question the stored bundle has to be able to answer.
 *
 * `jsonb` cannot answer it: it normalizes object keys by length, then bytewise. So this suite states
 * the property as a test rather than as a promise in a doc comment — an order that lives in key
 * positions is an order the storage layer is free to change, and it does.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:193 — DOC-LAW-1, array position is identity-by-accident
 */

/**
 * PostgreSQL's `jsonb` object-key normalization: shorter keys first, then bytewise.
 *
 * Reproduced here rather than asserted against a live database so the contract is pinned in the
 * package that declares it. Verified against PostgreSQL 17 while diagnosing this gap:
 * `SELECT jsonb_object_keys('{"t-zulu":{},"t-alfa":{}}'::jsonb)` yields `t-alfa` then `t-zulu`, and
 * the same literal cast to `json` yields the authored order — the column type is what decides.
 */
const asJsonbWouldStoreIt = <T>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
        Object.entries(record).sort(([left], [right]) =>
            left.length === right.length ? left.localeCompare(right, 'en') : left.length - right.length,
        ),
    )

describe('QnrQuestionBundle tab order', () => {
    // Deliberately chosen so authored order and jsonb order disagree: equal length, reverse-sorted.
    const authored = ['t-zulu', 't-alfa']

    const bundle: QnrQuestionBundle = {
        rootQuestionId: 'q-grid',
        questionsById: {
            'q-grid': { type: 'QuestionGrid', grid: { columnIds: ['q-col'] }, presentation: { headerTabId: 't-zulu' } },
            'q-col': { type: 'TextShort' },
        },
        tabsById: { 't-zulu': { label: 'Første' }, 't-alfa': { label: 'Andre' } },
        tabOrder: authored,
    }

    it('loses the authored order when it lives in key positions', () => {
        // The gap this member closes, kept executable: if a future storage change made key order
        // stable, this assertion fails and the member's justification has to be revisited.
        const stored = asJsonbWouldStoreIt(bundle.tabsById ?? {})

        assert.deepEqual(Object.keys(stored), ['t-alfa', 't-zulu'])
        assert.notDeepEqual(Object.keys(stored), authored)
    })

    it('normalizes shorter keys first, not plain alphabetically', () => {
        // Pins the rule rather than just "some reordering happens". The two-tab fixture above has
        // equal-length ids, where length-first and alphabetical agree — so on its own it would accept
        // a wrong model of jsonb. Measured: `SELECT jsonb_object_keys('{"bbb":1,"aa":2,"cccc":3}')`
        // yields aa, bbb, cccc, so a longer key sorts after a shorter one whatever the bytes say.
        assert.deepEqual(Object.keys(asJsonbWouldStoreIt({ 't-b': 1, 't-aa': 2 })), ['t-b', 't-aa'])

        // Alphabetically 't-aa' precedes 't-b', which is the answer this must NOT give.
        assert.notDeepEqual(Object.keys(asJsonbWouldStoreIt({ 't-b': 1, 't-aa': 2 })), ['t-aa', 't-b'])
    })

    it('round-trips the authored order through tabOrder', () => {
        // An array, so jsonb preserves it — arrays are ordered in both json and jsonb.
        const stored: QnrQuestionBundle = {
            ...bundle,
            tabsById: asJsonbWouldStoreIt(bundle.tabsById ?? {}),
            tabOrder: [...(bundle.tabOrder ?? [])],
        }

        assert.deepEqual(stored.tabOrder, authored)
        // And it still names exactly the carried tabs — the property a validator checks.
        assert.deepEqual([...(stored.tabOrder ?? [])].sort(), Object.keys(stored.tabsById ?? {}).sort())
    })

    it('is absent, not empty, on a bundle with nothing to order', () => {
        // DOC-LAW-2's shape rule reaches the fragment too: a single-tab bundle states no order, and
        // `tabOrder: []` would be a second encoding of "not set".
        const singleTab: QnrQuestionBundle = {
            rootQuestionId: 'q-grid',
            questionsById: { 'q-grid': { type: 'QuestionGrid', presentation: { headerTabId: 't-only' } } },
            tabsById: { 't-only': { label: 'Eneste' } },
        }

        assert.equal('tabOrder' in singleTab, false)
    })
})
