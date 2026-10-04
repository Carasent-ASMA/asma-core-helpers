import type { QnrTemplateDocument } from './templateDocument.js'

/** Additive source-state laws; old ARRAY documents have no new validation or reinterpretation. */
export type NarrativePresenceViolation = {
    law: 'NARRATIVE-PRESENCE'
    path: string
    detail: string
}

/** Count occurrences, not just distinct owners: duplicate structural references are ambiguous. */
export const hasSingleNarrativeQuestionOwner = (document: QnrTemplateDocument, questionId: string): boolean => {
    if (questionId === '' || !Object.hasOwn(document.questionsById ?? {}, questionId)) return false
    let occurrences = document.questionOrder.filter((id) => id === questionId).length
    for (const question of Object.values(document.questionsById ?? {})) {
        if (question.type === 'QuestionGrid') {
            occurrences += (question.grid?.columnIds ?? []).filter((id) => id === questionId).length
        }
    }
    return occurrences === 1
}

/** Marker position is exact: similarly named open rule/condition extras are ordinary historical data. */
export const findNarrativePresenceViolations = (document: QnrTemplateDocument): NarrativePresenceViolation[] => {
    const violations: NarrativePresenceViolation[] = []
    for (const [questionId, settings] of Object.entries(document.narrativeRuleSettingsByQuestionId ?? {})) {
        if (settings === null || typeof settings !== 'object' || !Object.hasOwn(settings, 'conditionalPresence')) continue
        const path = `narrativeRuleSettingsByQuestionId[${JSON.stringify(questionId)}].conditionalPresence`
        const marker = settings.conditionalPresence
        const validShape = !Array.isArray(settings) && Object.keys(settings).every((key) =>
            key === 'conditionalPresence' || ((key === 'enabled' || key === 'requiredAll') && settings[key] === true))
        if (!validShape || (marker !== 'absent' && marker !== 'null')) {
            violations.push({ law: 'NARRATIVE-PRESENCE', path, detail: 'Malformed source presence settings' })
        }
        if (!hasSingleNarrativeQuestionOwner(document, questionId)) {
            violations.push({ law: 'NARRATIVE-PRESENCE', path, detail: 'Presence target must have exactly one structural owner' })
        }
        if ((document.narrativeRuleOrderByQuestionId?.[questionId]?.length ?? 0) !== 0) {
            violations.push({ law: 'NARRATIVE-PRESENCE', path, detail: 'Source presence cannot coexist with owned narrative rules' })
        }
    }
    return violations
}
