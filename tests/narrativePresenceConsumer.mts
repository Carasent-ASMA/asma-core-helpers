// Built-export type probe; executed with tsc by the source-package gate, never a consumer writer.
import type { TemplateOp, NarrativeRuleSettings, QnrQuestionBundle } from 'asma-core-helpers/collaboration'
const settings: NarrativeRuleSettings = { enabled: true, conditionalPresence: 'absent' }
const bundle: QnrQuestionBundle = { rootQuestionId: 'q', questionsById: { q: { type: 'TextShort' } },
    narrativeRuleSettingsByQuestionId: { q: settings }, narrativeRulesById: { r: { condition: { sourceQuestionId: 's' } } },
    narrativeRuleOrderByQuestionId: { q: ['r'] } }
const edit: TemplateOp = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: 'null',
    intent: 'repair-null', action: { kind: 'set', ruleId: 'r', condition: { sourceQuestionId: 's', retained: true } } }
// @ts-expect-error ARRAY has no stored literal; omission is its only encoding.
const invalidMarker: NarrativeRuleSettings = { conditionalPresence: 'array' }
// @ts-expect-error NULL only accepts the correlated repair intent.
const invalidIntent: TemplateOp = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: 'null', intent: 'edit', action: { kind: 'materialize' } }
// @ts-expect-error repair cannot delete a NULL collection.
const invalidDelete: TemplateOp = { type: 'narrativeRuleCollection.edit', questionId: 'q', expectedPresence: 'null', intent: 'repair-null', action: { kind: 'delete', ruleId: 'r' } }
void [bundle, edit, invalidMarker, invalidIntent, invalidDelete]
