import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

// The same assertions run against the built subpath and the exact registry tarball after release.
const entry = process.env['ASMA_RULE_PACKAGE_ENTRY'] ?? 'asma-core-helpers/collaboration'

test('publishes ASMA-7684 fieldwise narrative/highlight authoring and frozen history', async () => {
    const mod = await import(entry)
    for (const opType of ['highlightRule.setField', 'highlightRuleSettings.set', 'narrativeRuleSettings.set']) {
        assert.ok(mod.IMPLEMENTED_OP_TYPES.includes(opType))
        assert.ok(mod.SCHEMA_TEMPLATE_OP_TYPES.includes(opType))
    }
    assert.deepEqual([...mod.SCHEMA_TEMPLATE_OP_TYPES].sort(), [...mod.IMPLEMENTED_OP_TYPES].sort())
    const doc = {
        documentId: 'package-7684', revision: 0,
        questionsById: { q: { type: 'TextShort' }, s: { type: 'BooleanQuestion' } }, questionOrder: ['q', 's'],
        highlightRulesById: { h: { condition: { sourceQuestionId: 's' }, state: 2, highlight: true, showLink: true } },
        highlightRuleOrderByQuestionId: { q: ['h'] },
        narrativeRulesById: { n: { condition: { sourceQuestionId: 's' } } }, narrativeRuleOrderByQuestionId: { q: ['n'] },
    }
    const ops = [
        { type: 'highlightRule.setField', questionId: 'q', ruleId: 'h', field: 'condition', value: { sourceQuestionId: 's', operator: 'true' } },
        { type: 'highlightRule.setField', questionId: 'q', ruleId: 'h', field: 'showLink', value: false },
        { type: 'narrativeRuleSettings.set', questionId: 'q', field: 'enabled', value: true },
        { type: 'narrativeRuleSettings.set', questionId: 'q', field: 'requiredAll', value: true },
        { type: 'narrativeRuleSettings.set', questionId: 'q', field: 'enabled', value: false },
        { type: 'highlightRuleSettings.set', questionId: 'q', field: 'enabled', value: true },
    ]
    let next = doc
    for (const op of ops) {
        assert.equal(mod.templateOpSchema.allows(op), true)
        next = mod.applyOperation(next, op)
    }
    assert.deepEqual(next.highlightRulesById.h, { ...doc.highlightRulesById.h, condition: ops[0].value, showLink: false })
    assert.deepEqual(next['narrativeRuleSettingsByQuestionId'], { q: { requiredAll: true } })
    assert.deepEqual(next['highlightRuleSettingsByQuestionId'], { q: { enabled: true } })
    assert.deepEqual(next.narrativeRulesById, doc.narrativeRulesById)
    assert.equal(mod.validateTemplateDocument(next).ok, true)
    assert.deepEqual(mod.findTemplateSchemaDocLawViolations(), [])

    for (const type of ['highlightRuleSettings.set', 'narrativeRuleSettings.set']) {
        for (const patch of [{ field: 'wrong' }, { value: null }, { value: 'false' }, { extra: true }]) {
            const op = { type, questionId: 'q', field: 'enabled', value: true, ...patch }
            assert.equal(mod.templateOpSchema.allows(op), false)
            assert.throws(() => mod.applyOperation(next, op), mod.OperationConflictError)
        }
        assert.throws(() => mod.applyOperation(next, { type, questionId: 'deleted', field: 'enabled', value: true }), mod.OperationConflictError)
    }
    assert.throws(() => mod.applyOperation(next, { type: 'highlightRule.setField', questionId: 's', ruleId: 'h', field: 'state', value: 3 }), mod.OperationConflictError)
    const deleted = mod.applyOperation(next, { type: 'question.delete', questionId: 'q' })
    assert.equal(deleted.narrativeRuleSettingsByQuestionId, undefined)
    assert.equal(deleted.highlightRuleSettingsByQuestionId, undefined)

    // All existing predicates keep their previous false-flag treatment; only new writes use the new one.
    for (const predicate of [mod.templateDocumentIsDefaultV0281, mod.templateDocumentIsDefault, mod.templateAuthoringIsDefault]) {
        assert.equal(predicate('narrativeRuleSettingsByQuestionId.q.enabled', false), false)
    }
    assert.equal(mod.templateRuleAuthoringIsDefault('narrativeRuleSettingsByQuestionId.q.enabled', false), true)
    assert.deepEqual(mod.reduceToMinimalForm({ narrativeRuleSettingsByQuestionId: { q: { enabled: false } } }, { isDefault: mod.templateRuleAuthoringIsDefault }), {})
    const replay = mod.applyOperation(doc, { type: 'highlightRule.set', questionId: 'q', ruleId: 'h', condition: { sourceQuestionId: 's' } })
    assert.deepEqual(replay.highlightRulesById.h, { condition: { sourceQuestionId: 's' } })

    const declarations = await readFile(new URL('./templateDocument.d.ts', import.meta.resolve(entry)), 'utf8')
    assert.ok(declarations.includes('export type NarrativeRuleSettings'))
    assert.ok(declarations.includes('narrativeRuleSettingsByQuestionId?:'))
    const operations = await readFile(new URL('./operations.d.ts', import.meta.resolve(entry)), 'utf8')
    assert.ok(operations.includes('export type HighlightRuleFieldWrite'))
    assert.ok(operations.includes('narrativeRuleSettings.set'))
})
