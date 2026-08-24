import { type, type Type } from 'arktype'

import type { IsDefault } from './canonicalize.js'
import { findDocLawViolations, type DocLawViolation } from './docLaws.js'
import { IMPLEMENTED_ANSWER_OP_TYPES } from './answerOperations.js'
import { IMPLEMENTED_OP_TYPES } from './operations.js'
import { QUESTION_TYPES } from './questionTypes.js'
import type { BindingTarget, QnrTemplateDocument } from './templateDocument.js'
import {
    ACTION_TYPES,
    BINDING_CARDINALITIES,
    BINDING_ON_MANY,
    BINDING_ON_MISSING,
    BINDING_OPTION_DEFAULTS,
    KNOWN_ACTION_KINDS,
    MAPPING_FILTER_OPERATORS,
    bindingTargetKey,
} from './templateDocument.js'

/**
 * The ArkType schemas for the two hashed documents and both op vocabularies (plan TASK-003),
 * plus the mechanical DOC-LAW enforcement the plan calls the "schema lint".
 *
 * Three enforcement layers, deliberately layered (the docLaws.ts header explains why the
 * instance lint alone is not enough — and why the schema lint alone is not either):
 *
 * 1. **The schemas themselves** — typed document positions, closed discriminators, no `null`
 *    in document positions. Because a question's per-type bag is genuinely open, the schemas
 *    carry `[string]: unknown` index signatures; validation never sees inside those bags.
 * 2. **`findSchemaDocLawViolations`** — walks the schema's JSON Schema output and rejects
 *    *any* array-of-objects (DOC-LAW-1) or `null` (DOC-LAW-2) in a document schema. It runs
 *    over the schema, not over instances, so it is total: a shape can never violate the law
 *    "in an untested payload". The answer document is the named DOC-LAW-2 exception (OQ-V2-24):
 *    `null` is legal at answer-value leaves only.
 * 3. **`findDocLawDefaultViolations` + `templateDocumentIsDefault`** — the DOC-LAW-2 default
 *    half: "no key present with its own default value". `templateDocumentIsDefault` feeds
 *    `reduceToMinimalForm` so a spelled-out default and its absence hash identically, and
 *    `findDocLawDefaultViolations` reports the same fact on a stored document so the
 *    contract test can reject it before it reaches storage.
 *
 * The storage-side guard is the plan's `document <> jsonb_strip_nulls(document)` (catches
 * explicit null object fields only); the schema lint owns everything else.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-21-40-plan-qnr-stage2-new-model-editor-and-sync.md:563 — TASK-003
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:193 — DOC-LAW-1
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 — DOC-LAW-2
 */

// ─────────────────────────────── atoms ───────────────────────────────

const docScalar = 'string | number | boolean'

/** `OpValue` — the op layer keeps the explicit-unset tri-state DOC-LAW-2 bans in documents. */
const opValue = 'string | number | boolean | (string | number | boolean)[] | null'

/** `AnswerValue` — `null` is the deliberate-clear marker, legal in answer state only. */
const answerValue = 'string | number | boolean | (string | number | boolean)[] | null'

/** A byId collection — `Record<Id, X>`, DOC-LAW-1's keyed shape. */
const recordOf = <T extends Type>(value: T): { '[string]': T } => ({ '[string]': value })

// ─────────────────────────────── template document ───────────────────────────────

const ruleConditionSchema = type({
    sourceQuestionId: 'string',
    alternativeId: 'string?',
    /** M-067: the legacy conditional matches a SET of alternatives, which the singular id cannot carry. */
    alternativeIds: 'string[]?',
    operator: 'string?',
    "value?": docScalar,
    ...({ '[string]': 'unknown' } as const),
})

const visibilityRuleSchema = type({
    condition: ruleConditionSchema,
    ...({ '[string]': 'unknown' } as const),
})

const highlightRuleSchema = type({
    condition: ruleConditionSchema,
    /** M-067 authored outputs. `is_highlighted`/`highlight_state` stay runtime and are absent by design. */
    state: 'number?',
    highlight: 'boolean?',
    showLink: 'boolean?',
    ...({ '[string]': 'unknown' } as const),
})

/** M-067 per-question narrative settings. `true`-only: DOC-LAW-2 makes `false` and absent the same. */
const highlightRuleSettingsSchema = type({
    enabled: 'true?',
    requiredAll: 'true?',
})

const narrativeRuleSchema = type({
    condition: ruleConditionSchema,
    ...({ '[string]': 'unknown' } as const),
})

const qnrRuleSchema = type({
    condition: ruleConditionSchema,
    templateFamilyId: 'string',
    '+': 'reject',
})

/**
 * M-068 answer prefill. No `condition`: the rule propagates a value rather than evaluating an
 * operator, which is exactly why it is not a `visibilityRule`.
 */
const prefillRuleSchema = type({
    sourceQuestionId: 'string',
    sourceParentQuestionId: 'string?',
    ...({ '[string]': 'unknown' } as const),
})

const questionGridConfigSchema = type({
    columnIds: 'string[]?',
    minRows: 'number?',
    maxRows: 'number?',
    singleRow: 'boolean?',
    deletableRows: 'boolean?',
    alwaysNew: 'boolean?',
    timestamps: 'boolean?',
    editable: 'boolean?',
    rowTitle: 'string?',
})

const layoutPlacementSchema = type({
    row: 'number',
    cell: 'number',
    keepCellSize: 'boolean?',
})

const questionGridRowEditorSchema = type({
    "layoutByQuestionId?": recordOf(layoutPlacementSchema),
    ...({ '[string]': 'unknown' } as const),
})

const questionGridPresentationSchema = type({
    headerTabId: 'string?',
    "rowEditor?": questionGridRowEditorSchema,
    defaultColumnWidthsByQuestionId: 'Record<string, number>?',
    // Primitive id arrays, which DOC-LAW-1 allows: the per-entry filter configuration legacy kept in
    // `filter_ui.questions[]` belongs on the column question, so the grid owns only the selection.
    filterQuestionIds: 'string[]?',
    actionIds: 'string[]?',
    ...({ '[string]': 'unknown' } as const),
})

/** Every question field except the discriminator and the grid-only `grid` bag. */
const qnrQuestionCommonFields = {
    "subtype?": type.enumerated('ORDINARY', 'EMAIL'),
    "label?": 'string',
    "required?": 'boolean',
    "defaultValue?": docScalar,
    "presentation?": questionGridPresentationSchema,
    ...({ '[string]': 'unknown' } as const),
} as const

const NON_GRID_QUESTION_TYPES = QUESTION_TYPES.filter((questionType) => questionType !== 'QuestionGrid')

/**
 * A question, discriminated on `type` for one reason: `grid` carries `columnIds`, the array a
 * question's structural owner is read from, and only a `QuestionGrid` may own columns. The
 * per-type bag being open (`[string]: unknown`) means omitting the key from the non-grid branch
 * would admit it anyway, so that branch types it `never` — the schema itself then refuses a
 * document where an ordinary question claims to own questions.
 */
const qnrQuestionSchema = type.or(
    type({
        type: '"QuestionGrid"',
        "grid?": questionGridConfigSchema,
        ...qnrQuestionCommonFields,
    }),
    type({
        type: type.enumerated(...NON_GRID_QUESTION_TYPES),
        "grid?": 'never',
        ...qnrQuestionCommonFields,
    }),
)

const qnrAlternativeSchema = type({
    "label?": 'string',
    "value?": docScalar,
    ...({ '[string]': 'unknown' } as const),
})

const qnrGridRowSchema = type({
    label: 'string?',
    cells: 'Record<string, string | number | boolean>?',
    ...({ '[string]': 'unknown' } as const),
})

const qnrTabLayoutSchema = type({
    "placementsByQuestionId?": recordOf(layoutPlacementSchema),
    ...({ '[string]': 'unknown' } as const),
})

const qnrTabSchema = type({
    label: 'string?',
    "layout?": qnrTabLayoutSchema,
    ...({ '[string]': 'unknown' } as const),
})

/**
 * One metadata entry. `all: true` is the canonical all-to-all marker and is exclusive with the bounds —
 * a bare `{}` is refused, because DOC-LAW-2 would make "selected but unbounded" and "not selected" the
 * same absence.
 */
const actionMetadataSchema = type.or(
    // Every arm declares the OTHER arms' members `never`. Omitting them would not be enough: an
    // ArkType object admits undeclared keys, so `{all: true, from: 'a'}` would satisfy the bounded arm
    // and the exclusivity rule would exist only in the reducer.
    type({ from: docScalar, to: docScalar, "all?": 'never' }),
    type({ from: docScalar, "to?": 'never', "all?": 'never' }),
    type({ "from?": 'never', to: docScalar, "all?": 'never' }),
    type({ all: 'true', "from?": 'never', "to?": 'never' }),
)

/**
 * The action record stays BROAD: `kind` is an optional string and the bag is open, because released
 * documents carry unknown kinds and accidental UI buffers that must remain readable (ADR-0008 DEC-006).
 *
 * The typed members are declared so a KNOWN action's shape is validated where it is present — an
 * ordered primitive id array per grid, and canonical metadata per column — without making any of it
 * required. Narrowing `kind` here is exactly what the freeze forbids.
 */
const qnrActionSchema = type({
    kind: 'string?',
    label: 'string?',
    "actionType?": type.enumerated(...ACTION_TYPES),
    actionIdsByGridQuestionId: 'Record<string, string[]>?',
    "metadataByQuestionId?": recordOf(actionMetadataSchema),
    ...({ '[string]': 'unknown' } as const),
})

const mappingNodeSchema = type({
    entityId: 'string',
    parentNodeId: 'string?',
    relationshipId: 'string?',
    filterOrder: 'string[]?',
    ...({ '[string]': 'unknown' } as const),
})

const bindingTargetSchema = type.or(
    type({ kind: '"question"', questionId: 'string' }),
    type({ kind: '"gridColumn"', gridQuestionId: 'string', columnQuestionId: 'string' }),
)

/**
 * The three behaviour vocabularies, derived from the single declaration in `templateDocument.ts`
 * rather than re-spelled — a second list of literals here could drift from the one the reducer and
 * the UI branch on, and the drift would only show up as a validation refusal in production.
 */
const bindingCardinalitySchema = type.enumerated(...BINDING_CARDINALITIES)
const bindingOnMissingSchema = type.enumerated(...BINDING_ON_MISSING)
const bindingOnManySchema = type.enumerated(...BINDING_ON_MANY)

const mappingBindingSchema = type({
    nodeId: 'string',
    fieldId: 'string',
    target: bindingTargetSchema,
    // Closed sets, not `string?`: these compile into an immutable artifact, so a typo that validates
    // here is a wrong prefill nobody can fix in place afterwards.
    'cardinality?': bindingCardinalitySchema,
    'onMissing?': bindingOnMissingSchema,
    'onMany?': bindingOnManySchema,
    ...({ '[string]': 'unknown' } as const),
})

/**
 * The stored filter. `operator` stays `string` — released, and documents carry operators outside the
 * closed set (`contains`) that must remain readable. `values`/`from`/`to` are the additive payload
 * members the typed operator arms write.
 */
const mappingFilterSchema = type({
    fieldId: 'string',
    operator: 'string',
    "value?": docScalar,
    "values?": '(string | number | boolean)[]',
    "from?": docScalar,
    "to?": docScalar,
})

const dataMappingSchema = type({
    sourceId: 'string',
    rootNodeId: 'string',
    bindingOrder: 'string[]?',
})

const qnrTemplateMetaSchema = type({
    title: 'string?',
    description: 'string?',
    "settings?": type({
        "journal?": type({
            requires_activity_id: 'boolean?',
        }),
        "recipient?": type({
            ask_for_phone_nr: 'boolean?',
        }),
        ...({ '[string]': 'unknown' } as const),
    }),
    "instancePolicy?": type({
        "requiredAccessLevel?": '1 | 2 | 3 | 4',
        invitationRequired: 'boolean?',
        "initiator?": '"coordinator" | "recipient"',
        "template_update_mode?": '"never" | "always" | "ask"',
    }),
    presentationProfiles: 'Record<string, unknown>?',
    "compatibility?": type({
        consentTemplateIds: 'string[]?',
        smsTemplateIds: 'string[]?',
    }),
    ...({ '[string]': 'unknown' } as const),
})

export const qnrTemplateDocumentSchema = type({
    documentId: 'string',
    revision: 'number',
    "meta?": qnrTemplateMetaSchema,
    "questionsById?": recordOf(qnrQuestionSchema),
    questionOrder: 'string[]',
    "gridRowsById?": recordOf(qnrGridRowSchema),
    gridRowOrderByQuestionId: 'Record<string, string[]>?',
    "alternativesById?": recordOf(qnrAlternativeSchema),
    alternativeOrderByQuestionId: 'Record<string, string[]>?',
    "tabsById?": recordOf(qnrTabSchema),
    tabOrder: 'string[]?',
    "actionsById?": recordOf(qnrActionSchema),
    "visibilityRulesById?": recordOf(visibilityRuleSchema),
    visibilityRuleOrderByQuestionId: 'Record<string, string[]>?',
    "highlightRulesById?": recordOf(highlightRuleSchema),
    highlightRuleOrderByQuestionId: 'Record<string, string[]>?',
    "narrativeRulesById?": recordOf(narrativeRuleSchema),
    narrativeRuleOrderByQuestionId: 'Record<string, string[]>?',
    "qnrRulesById?": recordOf(qnrRuleSchema),
    qnrRuleOrderByQuestionId: 'Record<string, string[]>?',
    "prefillRulesById?": recordOf(prefillRuleSchema),
    prefillRuleOrderByQuestionId: 'Record<string, string[]>?',
    "highlightRuleSettingsByQuestionId?": recordOf(highlightRuleSettingsSchema),
    "dataMappingsById?": recordOf(dataMappingSchema),
    "mappingNodesById?": recordOf(mappingNodeSchema),
    "mappingBindingsById?": recordOf(mappingBindingSchema),
    "mappingFiltersById?": recordOf(mappingFilterSchema),
})

// ─────────────────────────────── answer document ───────────────────────────────

export const qnrAnswerDocumentSchema = type({
    documentId: 'string',
    revision: 'number',
    answersByQuestionId: `Record<string, ${answerValue}>?`,
    gridAnswersByQuestionId: `Record<string, Record<string, Record<string, ${answerValue}>>>?`,
    "answerGridRowsById?": recordOf(
        type({
            questionGridId: 'string',
            entityRef: 'string?',
            deleted: 'true',
        }),
    ),
    answerGridRowOrderByQuestionId: 'Record<string, string[]>?',
})

// ─────────────────────────────── op vocabularies ───────────────────────────────

export const templateOpSchema = type.or(
    type({ type: '"template.updateMeta"', patch: `Record<string, ${opValue} | Record<string, unknown>>` }),
    type({ type: '"template.updateSettings"', patch: `Record<string, ${opValue} | Record<string, unknown>>` }),
    type({
        type: '"question.create"',
        questionId: 'string',
        questionType: type.enumerated(...QUESTION_TYPES),
        atIndex: 'number?',
    }),
    type({ type: '"question.updateField"', questionId: 'string', field: 'string', value: opValue }),
    type({ type: '"question.move"', questionId: 'string', toIndex: 'number' }),
    type({ type: '"question.delete"', questionId: 'string' }),
    type({
        type: '"gridColumn.create"',
        questionId: 'string',
        columnQuestionId: 'string',
        questionType: type.enumerated(...QUESTION_TYPES),
        atIndex: 'number?',
    }),
    type({ type: '"gridColumn.move"', questionId: 'string', columnQuestionId: 'string', toIndex: 'number' }),
    type({
        type: '"gridColumn.setLayout"',
        questionId: 'string',
        columnQuestionId: 'string',
        placement: type.or(layoutPlacementSchema, type('null')),
    }),
    type({
        type: '"gridColumn.setFilter"',
        questionId: 'string',
        columnQuestionId: 'string',
        include: 'boolean',
        atIndex: 'number?',
    }),
    type({
        type: '"gridColumn.setAction"',
        questionId: 'string',
        actionId: 'string',
        include: 'boolean',
        atIndex: 'number?',
    }),
    type({ type: '"gridRow.create"', questionId: 'string', rowId: 'string', label: 'string?', atIndex: 'number?' }),
    type({ type: '"gridRow.move"', questionId: 'string', rowId: 'string', afterRowId: 'string | null' }),
    type({ type: '"gridRow.delete"', questionId: 'string', rowId: 'string' }),
    type({
        type: '"gridRow.updateCell"',
        questionId: 'string',
        rowId: 'string',
        columnQuestionId: 'string',
        value: opValue,
    }),
    type({ type: '"alternative.create"', questionId: 'string', alternativeId: 'string', label: 'string?', atIndex: 'number?' }),
    type({
        type: '"alternative.updateField"',
        questionId: 'string',
        alternativeId: 'string',
        field: 'string',
        value: opValue,
    }),
    type({ type: '"alternative.move"', questionId: 'string', alternativeId: 'string', toIndex: 'number' }),
    type({ type: '"alternative.delete"', questionId: 'string', alternativeId: 'string' }),
    type({ type: '"tab.create"', tabId: 'string', label: 'string?', atIndex: 'number?' }),
    type({ type: '"tab.updateField"', tabId: 'string', field: 'string', value: opValue }),
    type({ type: '"tab.move"', tabId: 'string', toIndex: 'number' }),
    type({
        type: '"tab.setLayout"',
        tabId: 'string',
        questionId: 'string',
        placement: type.or(layoutPlacementSchema, type('null')),
    }),
    type({ type: '"tab.delete"', tabId: 'string' }),
    type({ type: '"action.create"', actionId: 'string', kind: 'string?' }),
    type({ type: '"action.updateField"', actionId: 'string', field: 'string', value: opValue }),
    type({
        type: '"action.createTyped"',
        actionId: 'string',
        kind: type.enumerated(...KNOWN_ACTION_KINDS),
        label: 'string?',
        "actionType?": type.enumerated(...ACTION_TYPES),
        // The typed path cannot mint a UI edit buffer. Declared `never` rather than merely omitted,
        // because an ArkType object admits undeclared keys — omission would let one through.
        "editableLabel?": 'never',
        "editableType?": 'never',
        "editable_label?": 'never',
        "editable_type?": 'never',
    }),
    type({
        type: '"action.setGridActionRef"',
        actionId: 'string',
        gridQuestionId: 'string',
        gridActionId: 'string',
        include: 'boolean',
        atIndex: 'number?',
    }),
    type({
        type: '"action.setMetadata"',
        actionId: 'string',
        questionId: 'string',
        metadata: type.or(actionMetadataSchema, type('null')),
    }),
    type({ type: '"action.delete"', actionId: 'string' }),
    type({ type: '"dataMapping.create"', mappingId: 'string', sourceId: 'string', rootNodeId: 'string' }),
    type({ type: '"dataMapping.delete"', mappingId: 'string' }),
    type({
        type: '"mappingNode.create"',
        nodeId: 'string',
        entityId: 'string',
        parentNodeId: 'string?',
        relationshipId: 'string?',
    }),
    type({
        type: '"mappingNode.update"',
        nodeId: 'string',
        patch: type({
            entityId: 'string?',
            "parentNodeId?": 'string | null',
            "relationshipId?": 'string | null',
            filterOrder: 'string[]?',
        }),
    }),
    type({ type: '"mappingNode.delete"', nodeId: 'string' }),
    type({
        type: '"mappingBinding.create"',
        bindingId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        target: bindingTargetSchema,
        'cardinality?': bindingCardinalitySchema,
        'onMissing?': bindingOnMissingSchema,
        'onMany?': bindingOnManySchema,
    }),
    type({
        type: '"mappingBinding.update"',
        bindingId: 'string',
        // `| null` on the three behaviours only: the op layer is where the absent-vs-cleared
        // tri-state lives (operations.ts header), so returning a behaviour to its default is
        // expressible without making "leave it alone" and "reset it" the same patch.
        patch: type({
            nodeId: 'string?',
            fieldId: 'string?',
            'target?': bindingTargetSchema,
            'cardinality?': bindingCardinalitySchema.or(type.null),
            'onMissing?': bindingOnMissingSchema.or(type.null),
            'onMany?': bindingOnManySchema.or(type.null),
        }),
    }),
    type({ type: '"mappingBinding.delete"', bindingId: 'string' }),
    type({
        type: '"mappingFilter.set"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: 'string',
        value: docScalar,
    }),
    /**
     * Operator-discriminated, so the payload cannot disagree with the operator: `eq` takes a value,
     * `in` a NON-EMPTY list, `range` at least one bound and no value, `isNull` a boolean. Each arm
     * declares the other operators' members `never`, which is what refuses a mixed record carrying a
     * stale `value` beside new `values`.
     */
    type({
        type: '"mappingFilter.setTyped"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: '"eq"',
        value: docScalar,
        "values?": 'never',
        "from?": 'never',
        "to?": 'never',
    }),
    type({
        type: '"mappingFilter.setTyped"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: '"in"',
        values: '(string | number | boolean)[] > 0',
        "value?": 'never',
        "from?": 'never',
        "to?": 'never',
    }),
    type({
        type: '"mappingFilter.setTyped"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: '"range"',
        from: docScalar,
        "to?": docScalar,
        "value?": 'never',
        "values?": 'never',
    }),
    type({
        type: '"mappingFilter.setTyped"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: '"range"',
        "from?": 'never',
        to: docScalar,
        "value?": 'never',
        "values?": 'never',
    }),
    type({
        type: '"mappingFilter.setTyped"',
        filterId: 'string',
        nodeId: 'string',
        fieldId: 'string',
        operator: '"isNull"',
        value: 'boolean',
        "values?": 'never',
        "from?": 'never',
        "to?": 'never',
    }),
    type({ type: '"mappingFilter.delete"', filterId: 'string' }),
    type({ type: '"visibilityRule.set"', ruleId: 'string', questionId: 'string', condition: ruleConditionSchema }),
    type({ type: '"visibilityRule.delete"', ruleId: 'string' }),
    type({ type: '"highlightRule.set"', ruleId: 'string', questionId: 'string', condition: ruleConditionSchema }),
    type({ type: '"highlightRule.delete"', ruleId: 'string' }),
    type({ type: '"narrativeRule.set"', ruleId: 'string', questionId: 'string', condition: ruleConditionSchema }),
    type({ type: '"narrativeRule.delete"', ruleId: 'string' }),
    type({
        type: '"qnrRule.set"',
        ruleId: 'string',
        questionId: 'string',
        condition: ruleConditionSchema,
        templateFamilyId: 'string',
        '+': 'reject',
    }),
    type({ type: '"qnrRule.delete"', ruleId: 'string' }),
)

export const answerOpSchema = type.or(
    type({ type: '"answer.set"', questionId: 'string', value: answerValue }),
    type({ type: '"answer.clear"', questionId: 'string' }),
    type({ type: '"gridRow.add"', questionId: 'string', rowId: 'string', afterRowId: 'string?' }),
    type({ type: '"gridRow.move"', questionId: 'string', rowId: 'string', afterRowId: 'string | null' }),
    type({ type: '"gridRow.remove"', questionId: 'string', rowId: 'string' }),
    type({
        type: '"gridAnswer.set"',
        questionId: 'string',
        rowId: 'string',
        columnQuestionId: 'string',
        value: answerValue,
    }),
)

// ─────────────────────────────── schema ↔ vocabulary parity ───────────────────────────────

type JsonSchemaLike = {
    anyOf?: JsonSchemaLike[]
    properties?: { type?: { const?: unknown } }
}

/**
 * The distinct op names a schema validates.
 *
 * **Deduplicated**, because one op type may legitimately span several union arms: an
 * operator-discriminated payload (`mappingFilter.setTyped`) is one op with five mutually exclusive
 * shapes, which is exactly how the payload is prevented from disagreeing with its operator. The parity
 * property is "the schema covers exactly these op TYPES", so counting arms instead of types would make
 * a correctly-modelled discriminated op look like a vocabulary mismatch.
 */
const opTypeNames = (schema: Type): string[] => {
    const json = schema.toJsonSchema() as unknown as JsonSchemaLike
    const members = json.anyOf ?? [json]
    const names = members
        .map((member) => member.properties?.type?.const)
        .filter((value): value is string => typeof value === 'string')

    return [...new Set(names)]
}

/**
 * The op names the schemas actually validate, extracted from the JSON Schema output. The
 * parity test asserts these equal `IMPLEMENTED_OP_TYPES` — a vocabulary member added to the
 * TS union but forgotten in the schemas (or vice versa) is a red build, not a runtime gap.
 */
export const SCHEMA_TEMPLATE_OP_TYPES: readonly string[] = opTypeNames(templateOpSchema)
export const SCHEMA_ANSWER_OP_TYPES: readonly string[] = opTypeNames(answerOpSchema)

// ─────────────────────────────── DOC-LAW schema lint ───────────────────────────────

/** A schema position where a DOC-LAW violation is reported (path follows the JSON pointer). */
export type SchemaViolation = {
    law: 'DOC-LAW-1' | 'DOC-LAW-2'
    /** Path into the JSON Schema document; `[]` marks array element positions. */
    path: string
    detail: string
}

type JsonSchemaNode = {
    $ref?: string
    $defs?: Record<string, JsonSchemaNode>
    type?: string | string[]
    const?: unknown
    enum?: unknown[]
    properties?: Record<string, JsonSchemaNode>
    additionalProperties?: JsonSchemaNode | boolean
    items?: JsonSchemaNode | JsonSchemaNode[]
    prefixItems?: JsonSchemaNode[]
    anyOf?: JsonSchemaNode[]
    oneOf?: JsonSchemaNode[]
    allOf?: JsonSchemaNode[]
    not?: JsonSchemaNode
}

const primitiveTypeOf = (value: unknown): string =>
    typeof value === 'object' && value !== null ? 'object' : typeof value

/**
 * The JSON-schema-level types a node can match. A union node contributes the union of its
 * branches' types (so a primitive union never collapses to 'object', which would turn an
 * array-of-primitives into a false DOC-LAW-1 finding); an object-shaped node is 'object'.
 */
const nodeTypes = (node: JsonSchemaNode, depth = 0): string[] => {
    if (node.type !== undefined) return Array.isArray(node.type) ? node.type : [node.type]
    if (node.enum !== undefined) return [...new Set(node.enum.map(primitiveTypeOf))]
    if (node.const !== undefined) return [primitiveTypeOf(node.const)]
    if (depth > 20) return []
    const merged: string[] = []
    for (const branches of [node.anyOf ?? [], node.oneOf ?? [], node.allOf ?? []]) {
        for (const branch of branches) merged.push(...nodeTypes(branch, depth + 1))
    }
    if (node.properties !== undefined || node.additionalProperties !== undefined || node.not !== undefined) {
        merged.push('object')
    }
    return [...new Set(merged)]
}

const joinSchemaPath = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`)

/**
 * The DOC-LAW-1/2 schema lint (plan TASK-003). Walks the JSON Schema output of a document
 * schema and reports every array-of-objects (DOC-LAW-1) and every position that allows
 * `null` (DOC-LAW-2). `allowNullAt` names the DOC-LAW-2 exception positions — the answer
 * document's answer-value leaves (OQ-V2-24); the template document allows none.
 *
 * It is a contract test, not a runtime guard: validation of incoming documents happens on
 * the schema itself, and a payload can only fail the law by failing the schema.
 */
export const findSchemaDocLawViolations = (
    schemaJson: JsonSchemaNode,
    options: { allowNullAt?: (path: string) => boolean } = {},
): SchemaViolation[] => {
    const violations: SchemaViolation[] = []
    const seen = new Set<JsonSchemaNode>()

    const resolveRef = (ref: string): JsonSchemaNode | undefined => {
        if (!ref.startsWith('#/$defs/')) return undefined
        const name = ref.slice('#/$defs/'.length)
        return schemaJson.$defs?.[name]
    }

    const walk = (node: JsonSchemaNode | boolean | undefined, path: string): void => {
        if (typeof node === 'boolean' || node === undefined) return
        if (seen.has(node)) return
        seen.add(node)

        const resolved = node.$ref !== undefined ? (resolveRef(node.$ref) ?? node) : node
        if (resolved !== node) {
            walk(resolved, path)
            return
        }

        const types = nodeTypes(resolved)

        if (types.includes('null') || resolved.enum?.includes(null) || resolved.const === null) {
            if (!options.allowNullAt?.(path)) {
                violations.push({ law: 'DOC-LAW-2', path, detail: 'schema allows explicit null; absent is the only encoding of "not set"' })
            }
        }

        if (types.includes('array')) {
            const items = Array.isArray(resolved.items) ? resolved.items : resolved.items !== undefined ? [resolved.items] : []
            const itemTypes = [...new Set(items.flatMap((item) => (typeof item === 'object' ? nodeTypes(item) : [])))]
            if (itemTypes.some((t) => t === 'object' || t === 'array')) {
                violations.push({
                    law: 'DOC-LAW-1',
                    path,
                    detail: 'array of objects; use <x>ById plus a primitive order array',
                })
            }
        }

        for (const [key, child] of Object.entries(resolved.properties ?? {})) walk(child, joinSchemaPath(path, key))
        for (const branch of resolved.anyOf ?? []) walk(branch, path)
        for (const branch of resolved.oneOf ?? []) walk(branch, path)
        for (const branch of resolved.allOf ?? []) walk(branch, path)
        if (resolved.not !== undefined) walk(resolved.not, path)
        if (typeof resolved.additionalProperties === 'object') walk(resolved.additionalProperties, `${path}[]`)
        if (Array.isArray(resolved.items)) {
            for (const item of resolved.items) walk(item, `${path}[]`)
        } else if (typeof resolved.items === 'object') {
            walk(resolved.items, `${path}[]`)
        }
        for (const item of resolved.prefixItems ?? []) walk(item, `${path}[]`)
    }

    walk(schemaJson, '')
    return violations
}

/** The template document admits no explicit null anywhere (DOC-LAW-2, strict scope). */
export const findTemplateSchemaDocLawViolations = (): SchemaViolation[] =>
    findSchemaDocLawViolations(qnrTemplateDocumentSchema.toJsonSchema() as unknown as JsonSchemaNode)

/** The answer document's answer-value leaves are the one legal null home (OQ-V2-24). */
export const findAnswerSchemaDocLawViolations = (): SchemaViolation[] =>
    findSchemaDocLawViolations(qnrAnswerDocumentSchema.toJsonSchema() as unknown as JsonSchemaNode, {
        allowNullAt: (path) =>
            path.startsWith('answersByQuestionId') || path.startsWith('gridAnswersByQuestionId'),
    })

// ─────────────────────────────── DOC-LAW-2 defaults ───────────────────────────────

/**
 * The template document's default registry (DOC-LAW-2: "no key present with its own default
 * value"). Boolean flags whose legacy encoding is a `true | undefined` sentinel (M-069) have
 * `false` as their default — the stored minimal form omits them, and canonicalization must
 * hash a spelled-out `false` identically to its absence.
 *
 * Fields WITHOUT a declared default here are deliberately absent: no default is asserted
 * where the legacy semantics do not prove one (e.g. `grid.deletableRows`, `grid.editable`).
 */
const TEMPLATE_DOCUMENT_DEFAULT_PATHS: readonly string[] = [
    'required', // question-level (M-063: dedupe of the `@deprecated` dual; sentinel semantics)
    'requires_activity_id', // settings.journal (M-007 aliases; conservative OR resolves to required)
    'ask_for_phone_nr', // settings.recipient (recipient requirement, sentinel semantics)
    'invitationRequired', // instancePolicy (open level-1 is invitation-free — OQ-V2-2)
    'singleRow', // question.grid (legacy composite flag, sentinel semantics — OQ-V2-17)
    'alwaysNew', // question.grid (legacy base flag)
    'timestamps', // question.grid (legacy composite `row_timestamps`)
]

/**
 * The binding behaviours, whose default is a **value** rather than `false` and whose path must
 * therefore be matched exactly rather than by suffix.
 *
 * Anchored on `mappingBindingsById.<id>.<key>` on purpose: a mapping **node** may also carry a
 * `cardinality`, and its default is the catalog relation's — not a literal. A suffix rule would
 * read a node's deliberately-narrowed `cardinality: '0..1'` over a `0..*` relation as an omittable
 * default and drop the one member that made the node take a single row.
 */
const BINDING_OPTION_DEFAULT_PATH = /^mappingBindingsById\.[^.]+\.(cardinality|onMissing|onMany)$/

/**
 * The closed operator set, re-exported through the schema module so a consumer validating a filter and a
 * consumer authoring one read the same list. Declared once in `templateDocument.ts`.
 */
export const SCHEMA_MAPPING_FILTER_OPERATORS: readonly string[] = MAPPING_FILTER_OPERATORS

export const templateDocumentIsDefault: IsDefault = (path, value) => {
    const option = BINDING_OPTION_DEFAULT_PATH.exec(path)?.[1]

    if (option !== undefined) {
        return value === BINDING_OPTION_DEFAULTS[option as keyof typeof BINDING_OPTION_DEFAULTS]
    }

    return value === false && TEMPLATE_DOCUMENT_DEFAULT_PATHS.some((name) => path.endsWith(`.${name}`))
}

/**
 * The instance-side half of the default lint: every present-and-default field on a stored
 * template document, ready for the contract test to reject. Complements
 * `findDocLawViolations` (which owns null/empty collections); this one owns defaults.
 */
export const findDocLawDefaultViolations = (document: QnrTemplateDocument): DocLawViolation[] => {
    const violations: DocLawViolation[] = []
    const walk = (value: unknown, path: string): void => {
        if (value === null || typeof value !== 'object') return
        if (Array.isArray(value)) {
            value.forEach((member, index) => walk(member, `${path}.${index}`))
            return
        }
        for (const [key, member] of Object.entries(value)) {
            const memberPath = path === '' ? key : `${path}.${key}`
            if (templateDocumentIsDefault(memberPath, member)) {
                violations.push({ law: 'DOC-LAW-2', path: memberPath, detail: 'key present with its own default value' })
            }
            walk(member, memberPath)
        }
    }
    walk(document, '')
    return violations
}

// ─────────────────────────────── binding-target uniqueness ───────────────────────────────

/**
 * The §2.2a cardinality invariant as an executable check: at most one binding per target.
 * The reducer enforces it on `mappingBinding.create/update`; this validator covers every
 * other writer (import, direct document writes) so the invariant is total.
 */
export const findDuplicateBindingTargets = (
    document: QnrTemplateDocument,
): Array<{ target: BindingTarget; bindingIds: string[] }> => {
    const byTarget = new Map<string, { target: BindingTarget; bindingIds: string[] }>()
    for (const [bindingId, binding] of Object.entries(document.mappingBindingsById ?? {})) {
        const key = bindingTargetKey(binding.target)
        const entry = byTarget.get(key)
        if (entry === undefined) byTarget.set(key, { target: binding.target, bindingIds: [bindingId] })
        else entry.bindingIds.push(bindingId)
    }
    return [...byTarget.values()].filter((entry) => entry.bindingIds.length > 1)
}

// ─────────────────────────────── question ownership ───────────────────────────────

export type QuestionOwnershipViolation = {
    law: 'QUESTION-OWNERSHIP'
    kind: 'orphan' | 'ordered-and-column' | 'two-grids' | 'dangling-column'
    questionId: string
    gridQuestionIds: string[]
    path: string
    detail: string
}

/**
 * A question has exactly one structural owner: either `questionOrder` or one grid's
 * `columnIds`. This validator covers imported/directly-written documents in addition to
 * the reducer, and reports absent column records as dangling ownership references.
 */
export const findQuestionOwnershipViolations = (
    document: QnrTemplateDocument,
): QuestionOwnershipViolation[] => {
    const ownersByQuestionId = new Map<string, string[]>()
    for (const [gridQuestionId, question] of Object.entries(document.questionsById ?? {})) {
        // Only a grid owns columns. `grid` on any other type is a shape the document schema
        // refuses outright, and reading it as ownership here would be worse than ignoring it:
        // a stray key would adopt a top-level question, or cover for a real orphan by naming
        // an owner that owns nothing.
        if (question.type !== 'QuestionGrid') continue
        for (const columnQuestionId of question.grid?.columnIds ?? []) {
            const owners = ownersByQuestionId.get(columnQuestionId) ?? []
            if (!owners.includes(gridQuestionId)) owners.push(gridQuestionId)
            ownersByQuestionId.set(columnQuestionId, owners)
        }
    }

    const violations: QuestionOwnershipViolation[] = []
    for (const [questionId, gridQuestionIds] of ownersByQuestionId) {
        if (document.questionsById?.[questionId] !== undefined) continue
        violations.push({
            law: 'QUESTION-OWNERSHIP',
            kind: 'dangling-column',
            questionId,
            gridQuestionIds,
            path: `questionsById.${gridQuestionIds[0]}.grid.columnIds`,
            detail: 'column question is absent from questionsById',
        })
    }

    const topLevel = new Set(document.questionOrder)
    for (const questionId of Object.keys(document.questionsById ?? {})) {
        const gridQuestionIds = ownersByQuestionId.get(questionId) ?? []
        const path = `questionsById.${questionId}`
        if (!topLevel.has(questionId) && gridQuestionIds.length === 0) {
            violations.push({
                law: 'QUESTION-OWNERSHIP',
                kind: 'orphan',
                questionId,
                gridQuestionIds,
                path,
                detail: 'question is neither top-level nor owned by a grid',
            })
        }
        if (topLevel.has(questionId) && gridQuestionIds.length > 0) {
            violations.push({
                law: 'QUESTION-OWNERSHIP',
                kind: 'ordered-and-column',
                questionId,
                gridQuestionIds,
                path,
                detail: 'question is both top-level and owned by a grid',
            })
        }
        if (gridQuestionIds.length > 1) {
            violations.push({
                law: 'QUESTION-OWNERSHIP',
                kind: 'two-grids',
                questionId,
                gridQuestionIds,
                path,
                detail: 'question is owned by more than one grid',
            })
        }
    }
    return violations
}

// ─────────────────────────────── typed validators ───────────────────────────────

export type Validation<T> = { ok: true; value: T } | { ok: false; summary: string }

const validate =
    <T>(schema: Type) =>
    (value: unknown): Validation<T> => {
        const out = schema(value)
        if (out instanceof type.errors) return { ok: false, summary: out.summary }
        return { ok: true, value: out as T }
    }

export const validateTemplateDocument = validate<QnrTemplateDocument>(qnrTemplateDocumentSchema)

/**
 * Full template-document admission check for the contract test: schema + DOC-LAW-1/2 lints +
 * default lint + binding uniqueness. A document passes only in its canonical minimal form.
 */
export type TemplateDocumentContractViolation = DocLawViolation | QuestionOwnershipViolation

export const findTemplateDocumentContractViolations = (
    document: QnrTemplateDocument,
): TemplateDocumentContractViolation[] => [
    ...findDocLawViolations(document),
    ...findDocLawDefaultViolations(document),
    ...findQuestionOwnershipViolations(document),
]

export const findDuplicateBindingTargetsSummary = (document: QnrTemplateDocument): string[] =>
    findDuplicateBindingTargets(document).map(
        ({ target, bindingIds }) => `${bindingTargetKey(target)} bound by [${bindingIds.join(', ')}]`,
    )

// Referenced by the parity test without importing node internals into the browser bundle.
export { IMPLEMENTED_OP_TYPES, IMPLEMENTED_ANSWER_OP_TYPES }
