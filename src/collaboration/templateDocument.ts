/**
 * The template authoring document — a normalized entity graph with stable ids and
 * explicit order arrays, in DOC-LAW-1 / DOC-LAW-2 minimal form.
 *
 * Every collection is optional because DOC-LAW-2 forbids storing an empty one: a
 * document with no alternatives has no `alternativesById` key at all. Readers hydrate
 * to a total in-memory model once at the document boundary rather than writing `?? {}`
 * at each use site.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:152 (document shape)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:193 (DOC-LAW-1)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:214 (§2.2a mapping graph)
 */

import type { QuestionSubtype, QuestionType } from './questionTypes.js'

export type QuestionId = string
export type RowId = string
export type AltId = string
export type TabId = string
export type ActionId = string
export type NodeId = string
export type BindingId = string
export type FilterId = string
export type MappingId = string
export type VisibilityRuleId = string
export type HighlightRuleId = string
export type NarrativeRuleId = string
export type QnrRuleId = string

/** A scalar a document may carry. Deliberately not `any`: DOC-LAW-2 bans `null`. */
export type DocScalar = string | number | boolean

/**
 * The required access level of the pinned version (OQ-V2-2): 1 anonymous, 2 identifiable
 * without authentication, 3 lower-assurance authentication, 4 BankID. Never collapsed
 * to a boolean; `invitationRequired` is a separate axis.
 */
export type RequiredAccessLevel = 1 | 2 | 3 | 4

/** Who the questionnaire is initiated by (OQ-V2-15 wire vocabulary). */
export type Initiator = 'coordinator' | 'recipient'

/**
 * What happens to in-flight instances when the family publishes a new version
 * (OQ-V2-16, IMM-I5). v1 implements `never`; `always`/`ask` land later.
 */
export type TemplateUpdateMode = 'never' | 'always' | 'ask'

/**
 * The typed semantic body of the document (`meta`). Absent means the default, per
 * DOC-LAW-2 — a questionnaire that requires nothing special stores `meta` with only
 * what differs. Fields still open after the naming freeze (Gate-4) ride the index
 * signature; the decided fields are spelled out so a typo is a compile error.
 */
export type QnrTemplateMeta = {
    title?: string
    description?: string
    /** Journal-wiring settings (M-007 aliases normalize here). */
    settings?: {
        journal?: {
            /** `activityId_required`/`soknadid_required`/`sokndaid_required` unify here (architecture §2.2(7)). */
            requires_activity_id?: boolean
        }
        /** Recipient-side requirements. */
        recipient?: {
            /** Legacy `ask_for_phone_nr`. */
            ask_for_phone_nr?: boolean
        }
    }
    /** Admission policy of the pinned version (OQ-V2-2/15/16). */
    instancePolicy?: {
        requiredAccessLevel?: RequiredAccessLevel
        /** Open level-1 is invitation-free; invitation-protected level-1 sets this. */
        invitationRequired?: boolean
        initiator?: Initiator
        template_update_mode?: TemplateUpdateMode
    }
    /** Presentation profiles (PM-6): audience/flow/layout/visibility — still loose pending their editor. */
    presentationProfiles?: Record<string, unknown>
    /** Owner-domain soft references (REQ-013): ids only, no bodies, no FK validation. */
    compatibility?: {
        consentTemplateIds?: string[]
        smsTemplateIds?: string[]
    }
    [key: string]: unknown
}

/**
 * The per-question-type configuration of a `QuestionGrid` (OQ-V2-17) — the grid's own
 * structure and row repeat policy. Lives at `question.grid.*`.
 *
 * `singleRow` is kept as the authored boolean rather than normalized to `maxRows: 1`
 * (OQ-V2-17's "single_row → max 1"): the legacy flag also drives the add/remove-row UI,
 * so the derivation happens at read time and the document stores the intent.
 */
export type QuestionGridConfig = {
    /** The grid's columns — the simple child questions, in authored order (OQ-V2-17: `grid.columnIds`). */
    columnIds?: QuestionId[]
    minRows?: number
    maxRows?: number
    /** `single_row` in OQ-V2-17 prose — at most one row, no add/remove-row UI. */
    singleRow?: boolean
    deletableRows?: boolean
    alwaysNew?: boolean
    timestamps?: boolean
    /** M-117: legacy `CompositeQuestion.editable` / `row_title`. */
    editable?: boolean
    rowTitle?: string
}

/**
 * Grid-owned presentation (OQ-V2-17/25): row-editor layout, filters, grid actions,
 * highlight rules, the header-tab reference and authored default column widths live
 * here — there is no parallel `settings_ui` or `layoutByQuestionId` map.
 */
/** One atomic row-editor placement for a grid-owned column. */
export type LayoutPlacement = {
    row: number
    cell: number
    keepCellSize?: boolean
}

/** Row-editor state belongs to the owning grid, keyed by its column question ids. */
export type QuestionGridRowEditor = {
    layoutByQuestionId?: Record<QuestionId, LayoutPlacement>
    [key: string]: unknown
}

export type QuestionGridPresentation = {
    headerTabId?: TabId
    rowEditor?: QuestionGridRowEditor
    /** OQ-V2-25: authored defaults; per-user widths are preference state outside both documents. */
    defaultColumnWidthsByQuestionId?: Record<QuestionId, number>
    [key: string]: unknown
}

/**
 * `type` is the question's own discriminator (M-062), a closed union rather than a string — see
 * `questionTypes.ts` for why the value cannot be loose. Not to be confused with the other `kind`
 * slots in this file: `QnrAction.kind` and `BindingTarget.kind` discriminate *structure*, not the
 * question a user authored.
 */
export type QnrQuestion = {
    type: QuestionType
    subtype?: QuestionSubtype
    label?: string
    required?: boolean
    defaultValue?: DocScalar
    /** `QuestionGrid` only: the row repeat policy. */
    grid?: QuestionGridConfig
    /** `QuestionGrid` only: grid-owned presentation (layout, filters, actions, column widths). */
    presentation?: QuestionGridPresentation
    [key: string]: unknown
}

export type QnrAlternative = { label?: string; value?: DocScalar; [key: string]: unknown }

/** An authored predefined grid row; cells are keyed by column question id. */
export type QnrGridRow = {
    label?: string
    /** Authored default cell values, keyed by the column question id. */
    cells?: Record<QuestionId, DocScalar>
    [key: string]: unknown
}

export type QnrTab = { label?: string; [key: string]: unknown }
export type QnrAction = { kind?: string; [key: string]: unknown }

/**
 * A typed conditional (OQ-V2-17/architecture §2.2(4)): question visibility/highlight
 * depends on another question's answer. Legacy `dependent_question`+`dependent_questions`
 * duals normalize into rule collections (byId + per-question order, DOC-LAW-1).
 */
export type RuleCondition = {
    sourceQuestionId: QuestionId
    alternativeId?: AltId
    operator?: string
    value?: DocScalar
    [key: string]: unknown
}

export type VisibilityRule = { condition: RuleCondition; [key: string]: unknown }
export type HighlightRule = { condition: RuleCondition; [key: string]: unknown }
export type NarrativeRule = { condition: RuleCondition; [key: string]: unknown }
export type QnrRule = {
    condition: RuleCondition
    /** A `qnr_templates.id` family reference; pinned versions are intentionally unrepresentable. */
    templateFamilyId: string
}

/** One traversal step. Many questions off one entity share a single node (§2.2a). */
export type MappingNode = {
    entityId: string
    parentNodeId?: NodeId
    relationshipId?: string
    filterOrder?: FilterId[]
    [key: string]: unknown
}

/**
 * A binding's target. A `gridColumn` target is a pair, which is why the binding key is
 * a synthetic id rather than the question id (§2.2a).
 */
export type BindingTarget =
    | { kind: 'question'; questionId: QuestionId }
    | { kind: 'gridColumn'; gridQuestionId: QuestionId; columnQuestionId: QuestionId }

/** Serialises a binding target so the "one binding per target" invariant is checkable. */
export const bindingTargetKey = (target: BindingTarget): string =>
    target.kind === 'question'
        ? `question:${target.questionId}`
        : `gridColumn:${target.gridQuestionId}:${target.columnQuestionId}`

export type MappingBinding = {
    nodeId: NodeId
    fieldId: string
    target: BindingTarget
    cardinality?: string
    onMissing?: string
    onMany?: string
    [key: string]: unknown
}

/** Carries no `nodeId` back-pointer: the node already lists it (§2.2a). */
export type MappingFilter = {
    fieldId: string
    operator: string
    value?: DocScalar
}

/**
 * One mapping root (§2.2a): a binding set over one traversal tree. `sourceId` names the
 * concrete data source (never an abstract `'journal'` — OQ-V2-42); two entries may share
 * one `sourceId` when a template binds two disjoint roots of the same source.
 */
export type QnrDataMapping = {
    sourceId: string
    rootNodeId: NodeId
    bindingOrder?: BindingId[]
}

export type QnrTemplateDocument = {
    documentId: string
    revision: number
    meta?: QnrTemplateMeta
    questionsById?: Record<QuestionId, QnrQuestion>
    questionOrder: QuestionId[]
    gridRowsById?: Record<RowId, QnrGridRow>
    gridRowOrderByQuestionId?: Record<QuestionId, RowId[]>
    alternativesById?: Record<AltId, QnrAlternative>
    alternativeOrderByQuestionId?: Record<QuestionId, AltId[]>
    tabsById?: Record<TabId, QnrTab>
    tabOrder?: TabId[]
    actionsById?: Record<ActionId, QnrAction>
    visibilityRulesById?: Record<VisibilityRuleId, VisibilityRule>
    visibilityRuleOrderByQuestionId?: Record<QuestionId, VisibilityRuleId[]>
    highlightRulesById?: Record<HighlightRuleId, HighlightRule>
    highlightRuleOrderByQuestionId?: Record<QuestionId, HighlightRuleId[]>
    narrativeRulesById?: Record<NarrativeRuleId, NarrativeRule>
    narrativeRuleOrderByQuestionId?: Record<QuestionId, NarrativeRuleId[]>
    qnrRulesById?: Record<QnrRuleId, QnrRule>
    qnrRuleOrderByQuestionId?: Record<QuestionId, QnrRuleId[]>
    dataMappingsById?: Record<MappingId, QnrDataMapping>
    mappingNodesById?: Record<NodeId, MappingNode>
    mappingBindingsById?: Record<BindingId, MappingBinding>
    mappingFiltersById?: Record<FilterId, MappingFilter>
}

/**
 * A reusable question-template bundle (OQ-V2-1): the root question plus every owned
 * child question, alternative, predefined grid row, scoped tab/action, order and
 * internal reference needed to use it. Stored whole in `qnr_question_templates.bundle`;
 * a manual pick deep-copies and validates it into the family document.
 */
export type QnrQuestionBundle = {
    rootQuestionId: QuestionId
    questionsById: Record<QuestionId, QnrQuestion>
    gridRowsById?: Record<RowId, QnrGridRow>
    gridRowOrderByQuestionId?: Record<QuestionId, RowId[]>
    alternativesById?: Record<AltId, QnrAlternative>
    alternativeOrderByQuestionId?: Record<QuestionId, AltId[]>
    tabsById?: Record<TabId, QnrTab>
    actionsById?: Record<ActionId, QnrAction>
}

/**
 * A new family's document. `questionOrder` is present-and-empty rather than absent
 * because it is the document's only structural array and every reader indexes it; an
 * absent order array would make "no questions yet" and "malformed" the same shape.
 */
export const emptyTemplateDocument = (documentId: string): QnrTemplateDocument => ({
    documentId,
    revision: 0,
    questionOrder: [],
})
