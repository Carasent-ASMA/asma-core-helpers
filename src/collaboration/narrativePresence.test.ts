import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TemplateOp } from './operations.js'
import { emptyTemplateDocument, type QnrTemplateDocument } from './templateDocument.js'

// Reuse the SAME behavioral assertions against emitted JS for the compiling-mutant gate.
const testEntry = process.env['ASMA_NARRATIVE_TEST_ENTRY'] ?? './index.js'
const contract: typeof import('./index.js') = await import(testEntry)
const {
    applyOperation, OperationConflictError, canonicalJson, hashCanonical, reduceToMinimalForm,
    IMPLEMENTED_OP_TYPES, findNarrativePresenceViolations, findTemplateDocumentContractViolations,
    qnrTemplateDocumentSchema, SCHEMA_TEMPLATE_OP_TYPES, templateOpSchema, templateRuleAuthoringIsDefault,
    validateTemplateDocument, classifyTemplateAuthoringOverlap, readTemplateAuthoringLocus, templateAuthoringIntentsOf,
} = contract

type Edit = Extract<TemplateOp, { type: 'narrativeRuleCollection.edit' }>
const base = (): QnrTemplateDocument => [
    { type: 'question.create', questionId: 'q', questionType: 'TextShort' },
    { type: 'question.create', questionId: 'other', questionType: 'TextShort' },
    { type: 'question.create', questionId: 's', questionType: 'Dropdown' },
    { type: 'alternative.create', questionId: 's', alternativeId: 'a' },
    { type: 'question.create', questionId: 'grid', questionType: 'QuestionGrid' },
    { type: 'gridColumn.create', questionId: 'grid', columnQuestionId: 'column', questionType: 'BooleanQuestion' },
].reduce((doc, op) => applyOperation(doc, op as TemplateOp), emptyTemplateDocument('m065-shared'))
const marked = (presence: 'absent' | 'null', target = 'q'): QnrTemplateDocument => ({ ...base(),
    narrativeRuleSettingsByQuestionId: { [target]: { enabled: true, requiredAll: true, conditionalPresence: presence } },
})
const set = (expectedPresence: 'array' | 'absent' = 'absent', target = 'q', ruleId = 'r'): Edit => ({
    type: 'narrativeRuleCollection.edit', questionId: target, expectedPresence, intent: 'edit',
    action: { kind: 'set', ruleId, condition: { sourceQuestionId: 's', alternativeIds: ['a'], extra: ['preserved', 'preserved'] } },
})
const materialize = (expectedPresence: 'array' | 'absent' = 'absent', target = 'q'): Edit => ({
    type: 'narrativeRuleCollection.edit', questionId: target, expectedPresence, intent: 'edit', action: { kind: 'materialize' },
})
const unsafe = (doc: QnrTemplateDocument, op: unknown) => applyOperation(doc, op as TemplateOp)
const refuse = (doc: QnrTemplateDocument, op: unknown): void => {
    const before = structuredClone(doc)
    assert.throws(() => unsafe(doc, op), (error) => {
        assert.ok(error instanceof OperationConflictError)
        assert.equal(error.statusCode, 409)
        assert.equal(error.code, 'qnr_operation_conflict')
        return true
    })
    assert.deepEqual(doc, before, 'no partial input content/revision writes')
}
const remove = (questionId = 'q', ruleId = 'r'): Edit => ({ type: 'narrativeRuleCollection.edit', questionId,
    expectedPresence: 'array', intent: 'edit', action: { kind: 'delete', ruleId } })

describe('M065 shared O07/O09/O10/O11/O12: atomic source presence transitions', () => {
    for (const target of ['q', 'column']) it(`set enters ARRAY at ${target} once and preserves flags/extras/order`, () => {
        const input = marked('absent', target)
        const before = canonicalJson(input)
        const op = set('absent', target)
        const next = applyOperation(input, op)
        assert.equal(next.revision, input.revision + 1)
        assert.equal(canonicalJson(input), before)
        assert.deepEqual(next.narrativeRuleSettingsByQuestionId, { [target]: { enabled: true, requiredAll: true } })
        assert.deepEqual(next.narrativeRulesById?.r, { condition: (op.action as { condition: unknown }).condition })
        assert.deepEqual(next.narrativeRuleOrderByQuestionId, { [target]: ['r'] })
        const duplicate = applyOperation(next, set('array', target, 'r2'))
        assert.deepEqual(duplicate.narrativeRuleOrderByQuestionId, { [target]: ['r', 'r2'] })
        assert.deepEqual(duplicate.narrativeRulesById?.r, duplicate.narrativeRulesById?.r2, 'duplicate CONDITIONS remain separate occurrences')
        const withExtra = { ...duplicate, narrativeRulesById: { ...duplicate.narrativeRulesById, r: { ...duplicate.narrativeRulesById!.r!, imported: 'keep' } } }
        const updated = applyOperation(withExtra, { ...set('array', target), action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 'column' } } })
        assert.deepEqual(updated.narrativeRulesById?.r, { imported: 'keep', condition: { sourceQuestionId: 'column' } })
        assert.deepEqual(updated.narrativeRulesById?.r2, withExtra.narrativeRulesById?.r2)
        assert.deepEqual(updated.narrativeRuleOrderByQuestionId, duplicate.narrativeRuleOrderByQuestionId)
    })
    it('delete-last remains ARRAY and preserves both flags', () => {
        const input = applyOperation(marked('absent'), set())
        const next = applyOperation(input, remove())
        assert.equal(next.narrativeRulesById, undefined)
        assert.equal(next.narrativeRuleOrderByQuestionId, undefined)
        assert.deepEqual(next.narrativeRuleSettingsByQuestionId, { q: { enabled: true, requiredAll: true } })
        assert.equal(next.revision, input.revision + 1)
        assert.deepEqual(applyOperation(next, materialize('array')), { ...next, revision: next.revision + 1 })
    })
    for (const presence of ['absent', 'null'] as const) {
        for (const kind of ['set', 'materialize'] as const) it(`${presence} explicit ${kind} removes only the marker`, () => {
            const doc = marked(presence)
            const action = kind === 'set' ? set().action : { kind: 'materialize' as const }
            const op = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: presence,
                intent: presence === 'null' ? 'repair-null' : 'edit', action }
            assert.equal(templateOpSchema.allows(op), true)
            const next = unsafe(doc, op)
            assert.deepEqual(next.narrativeRuleSettingsByQuestionId, { q: { enabled: true, requiredAll: true } })
            assert.equal(next.revision, doc.revision + 1)
            assert.equal(!!next.narrativeRulesById?.r, kind === 'set')
        })
        for (const field of ['enabled', 'requiredAll'] as const) it(`${presence} flag ${field} is fieldwise and unrelated edits preserve marker`, () => {
            const doc = marked(presence)
            const cleared = applyOperation(doc, { type: 'narrativeRuleSettings.set', questionId: 'q', field, value: false })
            const expected = { ...doc.narrativeRuleSettingsByQuestionId!.q! }
            delete expected[field]
            assert.deepEqual(cleared.narrativeRuleSettingsByQuestionId, { q: expected })
            const other = applyOperation(cleared, { type: 'template.updateMeta', patch: { title: 'changed' } })
            assert.deepEqual(other.narrativeRuleSettingsByQuestionId, cleared.narrativeRuleSettingsByQuestionId)
            assert.equal(other.narrativeRuleSettingsByQuestionId?.q?.conditionalPresence, presence)
        })
        it(`${presence} canonical fixed point differs from ARRAY-empty without inventing empty-order encoding`, async () => {
            const doc = { ...marked(presence), narrativeRuleOrderByQuestionId: { q: [] } }
            const canonical = reduceToMinimalForm(doc, { isDefault: templateRuleAuthoringIsDefault })
            assert.equal(canonical.narrativeRuleSettingsByQuestionId?.q?.conditionalPresence, presence)
            assert.equal(canonical.narrativeRuleOrderByQuestionId, undefined)
            assert.deepEqual(reduceToMinimalForm(canonical, { isDefault: templateRuleAuthoringIsDefault }), canonical)
            const array = applyOperation(canonical, {
                type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: presence,
                intent: presence === 'null' ? 'repair-null' : 'edit', action: { kind: 'materialize' },
            } as Edit)
            assert.notEqual(await hashCanonical(canonical), await hashCanonical({ ...array, revision: canonical.revision }),
                'same revision: the source marker itself distinguishes ARRAY-empty')
            assert.deepEqual(findTemplateDocumentContractViolations(canonical), [])
        })
    }
    it('materialize marker-only settings prunes the target/root without manufacturing flags', () => {
        const doc = { ...base(), narrativeRuleSettingsByQuestionId: { q: { conditionalPresence: 'absent' as const } } }
        const next = applyOperation(doc, materialize())
        assert.equal(Object.hasOwn(next, 'narrativeRuleSettingsByQuestionId'), false)
        assert.equal(next.narrativeRuleOrderByQuestionId, undefined)
    })
})

describe('M065 shared O06/O11/O16: closed wire and direct-replay refusal', () => {
    for (const patch of [
        { questionId: '' }, { expectedPresence: 'ARRAY' }, { intent: 'repair-null' }, { extra: true },
        { action: null }, { action: [] }, { action: { kind: 'unknown' } },
        { action: { kind: 'materialize', extra: true } }, { action: { kind: 'set', ruleId: '', condition: { sourceQuestionId: 's' } } },
        { action: { kind: 'set', ruleId: 'r' } }, { action: { kind: 'set', ruleId: 'r', condition: null } },
        { action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', value: [] } } },
        { action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', alternativeIds: [1] } } },
        { action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', operator: 1 } } },
        { action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's' }, extra: true } },
    ]) it(`wire and direct replay reject ${JSON.stringify(patch)}`, () => {
        const op = { ...set(), ...patch }
        assert.equal(templateOpSchema.allows(op), false)
        refuse(marked('absent'), op)
    })
    for (const presence of ['array', 'absent', 'null'] as const) it(`stale ${presence} refuses with original bytes/revision`, () => {
        const doc = presence === 'array' ? base() : marked(presence)
        const expected = presence === 'array' ? 'absent' : 'array'
        refuse(doc, { ...materialize(), expectedPresence: expected })
    })
    it('NULL requires repair intent; delete cannot repair NULL or ABSENT', () => {
        for (const presence of ['absent', 'null'] as const) {
            refuse(marked(presence), { ...remove(), expectedPresence: presence, intent: presence === 'null' ? 'repair-null' : 'edit' })
        }
        const op = { ...set(), expectedPresence: 'null', intent: 'edit' }
        assert.equal(templateOpSchema.allows(op), false)
        refuse(marked('null'), op)
        assert.equal(templateOpSchema.allows({ ...remove(), expectedPresence: 'null', intent: 'repair-null' }), false)
    })
    for (const condition of [
        { sourceQuestionId: 'gone' }, { sourceQuestionId: 's', alternativeId: 'gone' },
        { sourceQuestionId: 's', alternativeIds: ['a', 'gone'] },
        { sourceQuestionId: 'column', alternativeId: 'a' },
        { sourceQuestionId: 's', value: Infinity }, { sourceQuestionId: 's', value: NaN },
    ]) it(`validates all condition references before marker removal: ${JSON.stringify(condition)}`, () => {
        refuse(marked('absent'), { ...set(), action: { kind: 'set', ruleId: 'r', condition } })
    })
    for (const key of ['operator', 'value', 'alternativeId', 'alternativeIds']) it(`direct replay matches wire refusal for explicit undefined ${key}`, () => {
        const op = { ...set(), action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', [key]: undefined } } }
        assert.equal(templateOpSchema.allows(op), false)
        refuse(marked('absent'), op)
    })
    it('refuses orphan/foreign/multiple/duplicate rule IDs and incomplete orders', () => {
        const owned = applyOperation(base(), set('array', 'other'))
        refuse(owned, set('array'))
        refuse(owned, remove())
        const orphan = { ...base(), narrativeRulesById: { r: { condition: { sourceQuestionId: 's' } } } }
        refuse(orphan, set('array'))
        const dangling = { ...base(), narrativeRuleOrderByQuestionId: { q: ['r'] } }
        refuse(dangling, set('array'))
        const ambiguous = { ...owned, narrativeRuleOrderByQuestionId: { q: ['r'], other: ['r'] } }
        refuse(ambiguous, set('array'))
        const duplicate = { ...owned, narrativeRuleOrderByQuestionId: { other: ['r', 'r'] } }
        refuse(duplicate, set('array', 'other'))
        refuse(base(), remove())
        refuse(owned, materialize('array', 'other'))
    })
    for (const target of ['q', 's']) it(`refuses missing/orphan/duplicate structural owner ${target}`, () => {
        const op = set('array')
        const orphan = base()
        orphan.questionOrder = orphan.questionOrder.filter((id) => id !== target)
        refuse(orphan, op)
        const duplicate = base()
        duplicate.questionOrder.push(target)
        refuse(duplicate, op)
        const gridOwned = base()
        gridOwned.questionsById!.grid!.grid!.columnIds!.push(target)
        refuse(gridOwned, op)
        const deleted = applyOperation(base(), { type: 'question.delete', questionId: target })
        refuse(deleted, op)
    })
    it('fresh-ID set refuses a target order containing another foreign-owned rule', () => {
        const doc = applyOperation(base(), set('array'))
        doc.narrativeRuleOrderByQuestionId!.other = ['r']
        refuse(doc, set('array', 'q', 'fresh'))
        const malformed = applyOperation(base(), set('array'))
        malformed.narrativeRulesById!.r = null as never
        refuse(malformed, set('array', 'q', 'fresh'))
    })
    it('refuses duplicate/foreign alternative ownership without replacing the marker', () => {
        const doc = marked('absent')
        doc.alternativeOrderByQuestionId!.s!.push('a')
        refuse(doc, set())
        const foreign = marked('absent')
        foreign.alternativeOrderByQuestionId!.column = ['a']
        refuse(foreign, set())
    })
})

describe('M065 shared O09/O10/O13/O16: document invariants, cleanup and old replay', () => {
    for (const marker of [null, false, true, '', 'array', 'unknown', undefined]) it(`rejects malformed marker ${String(marker)} rather than canonicalizing it to ARRAY`, () => {
        const doc = { ...base(), narrativeRuleSettingsByQuestionId: { q: { conditionalPresence: marker } } }
        assert.equal(qnrTemplateDocumentSchema.allows(doc), false)
        assert.equal(validateTemplateDocument(doc).ok, false)
        refuse(doc as QnrTemplateDocument, materialize('array'))
    })
    it('new settings entry stays closed and validates true-only flags', () => {
        for (const patch of [{ enabled: false }, { requiredAll: null }, { unknown: true }]) {
            const doc = { ...marked('absent'), narrativeRuleSettingsByQuestionId: { q: { conditionalPresence: 'absent', ...patch } } }
            assert.equal(qnrTemplateDocumentSchema.allows(doc), false)
            refuse(doc as QnrTemplateDocument, materialize())
        }
    })
    it('marker plus owned rules, missing owner and duplicate owner are contract refusals', () => {
        const withRule = applyOperation(base(), set('array'))
        const contradiction = { ...withRule, narrativeRuleSettingsByQuestionId: marked('absent').narrativeRuleSettingsByQuestionId }
        assert.equal(validateTemplateDocument(contradiction).ok, false)
        assert.ok(findTemplateDocumentContractViolations(contradiction).some((v) => v.law === 'NARRATIVE-PRESENCE'))
        refuse(contradiction, { type: 'template.updateMeta', patch: { title: 'cannot normalize' } })
        const missing = marked('null', 'gone')
        assert.equal(validateTemplateDocument(missing).ok, false)
        const duplicate = marked('absent')
        duplicate.questionOrder.push('q')
        assert.equal(validateTemplateDocument(duplicate).ok, false)
    })
    it('old setter cannot create marker+rules on new input; ARRAY old setter still moves/replaces/dangles', () => {
        refuse(marked('absent'), { type: 'narrativeRule.set', questionId: 'q', ruleId: 'r', condition: { sourceQuestionId: 's' } })
        const doc = applyOperation(base(), set('array'))
        const next = applyOperation(doc, { type: 'narrativeRule.set', questionId: 'other', ruleId: 'r', condition: { sourceQuestionId: 'historically-dangling', conditionalPresence: 'null' } })
        assert.deepEqual(next.narrativeRuleOrderByQuestionId, { other: ['r'] })
        assert.deepEqual(next.narrativeRulesById?.r, { condition: { sourceQuestionId: 'historically-dangling', conditionalPresence: 'null' } })
        assert.deepEqual(findNarrativePresenceViolations(next), [])
    })
    for (const questionId of ['q', 'column', 'grid']) it(`existing deletion cleans marker owner ${questionId}`, () => {
        const owner = questionId === 'grid' ? 'column' : questionId
        const doc = marked('null', owner)
        doc.narrativeRuleSettingsByQuestionId!.other = { enabled: true, conditionalPresence: 'absent' }
        const next = applyOperation(doc, { type: 'question.delete', questionId })
        assert.equal(next.narrativeRuleSettingsByQuestionId?.[owner], undefined)
        assert.deepEqual(next.narrativeRuleSettingsByQuestionId?.other, doc.narrativeRuleSettingsByQuestionId?.other)
        assert.equal(validateTemplateDocument(next).ok, true)
    })
    it('source deletion preserves target marker and never retargets it', () => {
        const doc = marked('absent')
        const next = applyOperation(doc, { type: 'question.delete', questionId: 's' })
        assert.deepEqual(next.narrativeRuleSettingsByQuestionId, doc.narrativeRuleSettingsByQuestionId)
        assert.equal(next.narrativeRuleSettingsByQuestionId?.s, undefined)
    })
    it('new vocabulary is present once and exported schemas preserve DOC laws', () => {
        for (const inventory of [IMPLEMENTED_OP_TYPES, SCHEMA_TEMPLATE_OP_TYPES]) {
            assert.equal(inventory.filter((type) => type === 'narrativeRuleCollection.edit').length, 1)
        }
        assert.deepEqual([...IMPLEMENTED_OP_TYPES].sort(), [...SCHEMA_TEMPLATE_OP_TYPES].sort())
    })
})

describe('M065 shared C_CONFLICT: intents, ownership dependencies and released classifier', () => {
    const status = (a: TemplateOp, b: TemplateOp, expected: string): void => {
        assert.equal(classifyTemplateAuthoringOverlap(a, b).status, expected)
        assert.equal(classifyTemplateAuthoringOverlap(b, a).status, expected, 'pair is symmetric')
    }
    it('marker leaf is determinate, order/rule opaque; materialize only writes marker', () => {
        assert.deepEqual(templateAuthoringIntentsOf(set()), [
            { locus: 'narrativeRuleSettingsByQuestionId["q"].conditionalPresence', kind: 'set', value: null },
            { locus: 'narrativeRuleOrderByQuestionId["q"]', kind: 'opaque' },
            { locus: 'narrativeRulesById["r"]', kind: 'opaque' },
        ])
        assert.deepEqual(templateAuthoringIntentsOf(materialize()), [templateAuthoringIntentsOf(set())[0]])
    })
    it('same-target distinct rule edits conflict, different-target independent rules commute', () => {
        status(set(), set('absent', 'q', 'r2'), 'conflict')
        status(set(), set('absent', 'other', 'r2'), 'disjoint')
        status(set(), set('absent', 'other', 'r'), 'conflict')
        status(materialize(), materialize(), 'convergent')
        status(materialize(), set(), 'conflict')
    })
    it('flag-only writes commute with collection edit and with one another in actual reducer', () => {
        for (const field of ['enabled', 'requiredAll'] as const) {
            const flag: TemplateOp = { type: 'narrativeRuleSettings.set', questionId: 'q', field, value: false }
            status(set(), flag, 'disjoint')
            const doc = marked('absent')
            assert.deepEqual(applyOperation(applyOperation(doc, set()), flag), applyOperation(applyOperation(doc, flag), set()))
        }
    })
    it('intervening target/source/grid deletion, alternative deletion/order and legacy rule move/delete conflict', () => {
        for (const op of [
            { type: 'question.delete', questionId: 'q' }, { type: 'question.delete', questionId: 's' },
            { type: 'question.delete', questionId: 'grid' },
            { type: 'gridColumn.move', questionId: 'grid', columnQuestionId: 'column', toIndex: 0 },
            { type: 'alternative.delete', questionId: 's', alternativeId: 'a' },
            { type: 'alternative.move', questionId: 's', alternativeId: 'a', toIndex: 1 },
            { type: 'narrativeRule.set', questionId: 'other', ruleId: 'r', condition: { sourceQuestionId: 's' } },
            { type: 'narrativeRule.delete', ruleId: 'r' },
        ] as TemplateOp[]) status(set(), op, 'conflict')
        status(materialize(), { type: 'narrativeRule.set', questionId: 'q', ruleId: 'r', condition: { sourceQuestionId: 's' } }, 'conflict')
    })
    it('pure source title/value edits and OLD-vs-OLD classifier stay released', () => {
        for (const field of ['title', 'value']) status(set(), { type: 'question.updateField', questionId: 's', field, value: 'changed' }, 'disjoint')
        const old: TemplateOp = { type: 'narrativeRule.set', questionId: 'q', ruleId: 'r', condition: { sourceQuestionId: 's' } }
        assert.deepEqual(templateAuthoringIntentsOf(old), [])
        status(old, { ...old, questionId: 'other' }, 'disjoint')
    })
    it('conflict value reader handles exact bracket IDs, own fields and missing/default ARRAY', () => {
        const id = 'q].a"quoted'
        const doc = marked('null')
        doc.questionsById![id] = { type: 'TextShort' }
        doc.questionOrder.push(id)
        doc.narrativeRuleSettingsByQuestionId![id] = { conditionalPresence: 'absent' }
        const locus = `narrativeRuleSettingsByQuestionId[${JSON.stringify(id)}].conditionalPresence`
        assert.equal(readTemplateAuthoringLocus(doc, locus), 'absent')
        assert.equal(readTemplateAuthoringLocus(doc, 'narrativeRuleSettingsByQuestionId["q"].conditionalPresence'), 'null')
        assert.equal(readTemplateAuthoringLocus(doc, 'narrativeRulesById["gone"]'), null)
        assert.equal(readTemplateAuthoringLocus(doc, 'narrativeRuleSettingsByQuestionId["__proto__"].conditionalPresence'), null)
        assert.equal(readTemplateAuthoringLocus(applyOperation(doc, materialize('absent', id)), locus), null)
    })
})
