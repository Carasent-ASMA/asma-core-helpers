import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// Also runs against the packed SOURCE candidate. This does not claim registry release/adoption.
const entry = process.env['ASMA_NARRATIVE_PACKAGE_ENTRY'] ?? 'asma-core-helpers/collaboration'

test('exports candidate presence schema/reducer/conflicts and bundle DTO through the built package', async () => {
    const mod = await import(entry)
    const doc = { documentId: 'm065-package', revision: 10, questionsById: { q: { type: 'TextShort' }, s: { type: 'BooleanQuestion' } },
        questionOrder: ['q', 's'], narrativeRuleSettingsByQuestionId: { q: { enabled: true, requiredAll: true, conditionalPresence: 'absent' } } }
    const op = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: 'absent', intent: 'edit',
        action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', extra: 'retained' } } }
    assert.equal(mod.validateTemplateDocument(doc).ok, true)
    assert.equal(mod.templateOpSchema.allows(op), true)
    const next = mod.applyOperation(doc, op)
    assert.equal(next.revision, 11)
    assert.deepEqual(next.narrativeRuleSettingsByQuestionId, { q: { enabled: true, requiredAll: true } })
    assert.deepEqual(next.narrativeRulesById, { r: { condition: op.action.condition } })
    assert.deepEqual(next.narrativeRuleOrderByQuestionId, { q: ['r'] })
    assert.equal(doc.narrativeRuleSettingsByQuestionId.q.conditionalPresence, 'absent')
    const dropped = mod.applyOperation(next, { ...op, expectedPresence: 'array', action: { kind: 'delete', ruleId: 'r' } })
    assert.equal(dropped.narrativeRulesById, undefined)
    assert.equal(dropped.narrativeRuleOrderByQuestionId, undefined)
    assert.deepEqual(dropped.narrativeRuleSettingsByQuestionId, next.narrativeRuleSettingsByQuestionId)
    assert.throws(() => mod.applyOperation(next, op), mod.OperationConflictError)
    assert.equal(mod.templateOpSchema.allows({ ...op, extra: true }), false)
    assert.equal(mod.templateOpSchema.allows({ ...op, expectedPresence: 'null', intent: 'edit' }), false)
    assert.equal(mod.classifyTemplateAuthoringOverlap(op, { type: 'alternative.delete', questionId: 's', alternativeId: 'a' }).status, 'conflict')
    assert.deepEqual(mod.findTemplateSchemaDocLawViolations(), [])
    assert.deepEqual(mod.findNarrativePresenceViolations({ ...doc, narrativeRuleOrderByQuestionId: { q: ['dangling'] } }).map((v: {law: string}) => v.law), ['NARRATIVE-PRESENCE'])
    const declarations = await readFile(new URL('./templateDocument.d.ts', import.meta.resolve(entry)), 'utf8')
    const bundle = declarations.slice(declarations.indexOf('export type QnrQuestionBundle'))
    for (const name of ['narrativeRulesById?', 'narrativeRuleOrderByQuestionId?', 'narrativeRuleSettingsByQuestionId?']) assert.ok(bundle.includes(name))
    assert.ok(declarations.includes("conditionalPresence?: 'absent' | 'null'"))
    const ops = await readFile(new URL('./operations.d.ts', import.meta.resolve(entry)), 'utf8')
    assert.ok(ops.includes('narrativeRuleCollection.edit'))
    assert.ok(ops.includes('NarrativeRuleCollectionAction'))
})

// The executing gate supplies the exact already-published 0.40/0.41 package entries. No local
// augmentation or source-tree substitute: these are old parser/reducer/predicate observations.
for (const version of ['040', '041']) {
    const baseline = process.env[`ASMA_NARRATIVE_BASELINE_${version}_ENTRY`]
    test(`old published ${version} parser rejects candidate arm; released replay and historical predicates stay identical`, { skip: baseline === undefined }, async () => {
        const old = await import(baseline!)
        const mod = await import(entry)
        const doc = { documentId: 'old-package', revision: 1, questionOrder: ['q', 's'],
            questionsById: { q: { type: 'TextShort' }, s: { type: 'BooleanQuestion' } },
            narrativeRulesById: { r: { condition: { sourceQuestionId: 's', conditionalPresence: 'null' }, conditionalPresence: 'absent', extra: 'historical' } },
            narrativeRuleOrderByQuestionId: { q: ['r'] } }
        const newOp = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: 'array', intent: 'edit', action: { kind: 'materialize' } }
        assert.equal(old.templateOpSchema.allows(newOp), false)
        if (version === '041') assert.equal(old.qnrTemplateDocumentSchema.allows({ ...doc,
            narrativeRuleSettingsByQuestionId: { q: { conditionalPresence: 'absent' } } }), false)
        const released = [
            { type: 'narrativeRule.set', questionId: 's', ruleId: 'r', condition: { sourceQuestionId: 'historically-dangling' } },
            { type: 'narrativeRule.delete', ruleId: 'r' },
            { type: 'question.updateField', questionId: 'q', field: 'title', value: 'old' },
            { type: 'question.delete', questionId: 'q' },
        ]
        for (const op of released) {
            assert.deepEqual(mod.applyOperation(doc, op), old.applyOperation(doc, op))
            assert.deepEqual(mod.classifyTemplateAuthoringOverlap(op, op), old.classifyTemplateAuthoringOverlap(op, op))
        }
        for (const name of ['templateDocumentIsDefaultV0281', 'templateDocumentIsDefault', 'templateAuthoringIsDefault',
            ...(version === '041' ? ['templateRuleAuthoringIsDefault'] : [])]) {
            const raw = { ...doc, questionsById: { ...doc.questionsById, q: { type: 'TextShort', required: false } },
                narrativeRuleSettingsByQuestionId: { q: { enabled: false, requiredAll: false } } }
            const current = mod.reduceToMinimalForm(raw, { isDefault: mod[name] })
            const historical = old.reduceToMinimalForm(raw, { isDefault: old[name] })
            assert.equal(mod.canonicalJson(current), old.canonicalJson(historical))
            assert.equal(await mod.hashCanonical(current), await old.hashCanonical(historical))
        }
    })
}
