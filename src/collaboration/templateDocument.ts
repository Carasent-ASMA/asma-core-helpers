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
export type PrefillRuleId = string

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
 * here — there is no parallel top-level layout map; `rowEditor` owns it.
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
    /**
     * Which of this grid's columns offer a filter control, in authored order (M-054).
     *
     * Legacy stores `filter_ui.questions[]` as an array of objects; DOC-LAW-1 forbids that, and the
     * per-entry flags it carried (`is_multi`, the date-interval bounds) are the *control's* configuration
     * rather than the grid's, so they belong on the column question. What the grid owns is the
     * selection and its order — a primitive id array, maintained one member at a time by
     * `gridColumn.setFilter` so two authors adding different filters concurrently both survive.
     */
    filterQuestionIds?: QuestionId[]
    /**
     * The grid-owned actions, in authored order (M-055) — **ids only, never bodies**. The action
     * records live in `actionsById`; duplicating them here would give one action two homes that could
     * disagree, which is the reason the field map routes grid actions into the root collection.
     */
    actionIds?: ActionId[]
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

/** A tab's positional grid: one placement per question it displays, keyed rather than positional. */
export type QnrTabLayout = {
    placementsByQuestionId?: Record<QuestionId, LayoutPlacement>
    [key: string]: unknown
}

/**
 * A header tab (M-051).
 *
 * `layout` is the typed successor to legacy `tab_editor.rows[].columns{}`, which is an array of rows
 * each holding an object of columns. DOC-LAW-1 rules that out for the reason it exists: two authors
 * moving different questions produce two whole-array patches, and the second silently discards the
 * first. Keyed placements make those two edits touch two keys instead.
 *
 * The index signature stays: a tab's authored bag is still open (`dependent_question_ids` and friends
 * arrive from the importer), and narrowing it would make an already-stored tab unreadable.
 */
export type QnrTab = { label?: string; layout?: QnrTabLayout; [key: string]: unknown }

/**
 * The **compatibility** action record: `kind` is an arbitrary optional string and the bag is open.
 *
 * Deliberately left broad. It is released, imported documents carry unknown kinds and accidental UI
 * buffers, and narrowing it would make those unreadable — ADR-0008 DEC-006. The typed vocabulary below
 * is additive and closed; a record is "known" only when its `kind` is one of `KNOWN_ACTION_KINDS`, and
 * everything else keeps replaying exactly as before.
 */
export type QnrAction = { kind?: string; [key: string]: unknown }

/** The two action kinds the typed path authors (M-052/M-055). Anything else is legacy-readable only. */
export const KNOWN_ACTION_KINDS = ['topLevelAction', 'gridAction'] as const
export type KnownActionKind = (typeof KNOWN_ACTION_KINDS)[number]

/** A grid action's effect. Absent is a valid incomplete draft; publication refuses it. */
export const ACTION_TYPES = ['COPY', 'UPDATE'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const isKnownActionKind = (kind: unknown): kind is KnownActionKind =>
    typeof kind === 'string' && (KNOWN_ACTION_KINDS as readonly string[]).includes(kind)

/**
 * What a top-level action does: for one composite/grid question, run an authored sequence of that
 * grid's existing actions (M-052).
 *
 * **Not a recursive action tree.** The legacy shape reads like one (`actions:[{id, question_id,
 * actions[]}]`), but the inner ids are grid actions that already exist in `actionsById`, so the v2
 * shape is a map from grid question id to an ordered id array. There is deliberately no
 * `childActionOrder` and no `questionId` member on an action.
 */
export type KnownTopLevelAction = {
    kind: 'topLevelAction'
    label?: string
    actionIdsByGridQuestionId?: Record<QuestionId, ActionId[]>
}

/**
 * One metadata entry of a grid action: which values it copies or updates between.
 *
 * `{ all: true }` is the canonical all-to-all marker and exists because DOC-LAW-2 would otherwise
 * erase the fact: legacy encodes all-to-all as `from: null, to: null`, and a document may carry
 * neither null nor an empty object, so "selected, unbounded" and "not selected at all" would become
 * the same absence. It is exclusive with `from`/`to`, and a bare `{}` is invalid for the same reason.
 */
/**
 * Every arm excludes the others' members with `?: never`, so the union is closed at COMPILE time and
 * not only in the reducer. Without the exclusions `{all: true, from: 'a'}` structurally satisfies the
 * from-only arm — TypeScript admits extra properties on a non-fresh object — and the exclusivity rule
 * would exist in three places (reducer, schema) but not in the type consumers actually program against.
 */
export type ActionMetadata =
    | { from: DocScalar; to: DocScalar; all?: never }
    | { from: DocScalar; to?: never; all?: never }
    | { from?: never; to: DocScalar; all?: never }
    | { all: true; from?: never; to?: never }

/** A grid-owned action (M-055): its effect, and the per-column values it applies to. */
export type KnownGridAction = {
    kind: 'gridAction'
    label?: string
    actionType?: ActionType
    metadataByQuestionId?: Record<QuestionId, ActionMetadata>
}

/** The closed typed vocabulary. A stored `QnrAction` is one of these only when its `kind` says so. */
export type KnownAction = KnownTopLevelAction | KnownGridAction

/**
 * A typed conditional (OQ-V2-17/architecture §2.2(4)): question visibility/highlight
 * depends on another question's answer. Legacy `dependent_question`+`dependent_questions`
 * duals normalize into rule collections (byId + per-question order, DOC-LAW-1).
 */
export type RuleCondition = {
    sourceQuestionId: QuestionId
    alternativeId?: AltId
    /**
     * The legacy conditional matches the source answer against a **set** of alternatives
     * (`condition.alternatives[]`), which the singular `alternativeId` cannot express (M-067). A
     * primitive id array rather than a keyed collection because identity lives in the values and a
     * member carrying nothing else reduces to `{}` under DOC-LAW-2 — the same reasoning that made
     * `normalizeAlternativeRefs` emit a primitive array.
     */
    alternativeIds?: AltId[]
    operator?: string
    value?: DocScalar
    [key: string]: unknown
}

export type VisibilityRule = { condition: RuleCondition; [key: string]: unknown }
/**
 * A highlight conditional (M-067). The three widened members are the authored outputs legacy stores
 * on each rule: `state` is the highlight severity `setHighlightState` applies when the condition
 * matches, `highlight` routes a highlighting rule from a plain conditional, and `showLink` is the
 * per-rule link toggle. `is_highlighted`/`highlight_state` are deliberately absent — they are
 * instance-computed runtime state, not authored content.
 */
export type HighlightRule = {
    condition: RuleCondition
    state?: number
    highlight?: boolean
    showLink?: boolean
    [key: string]: unknown
}

/**
 * Per-question narrative settings (M-067), a separate collection rather than fields denormalized
 * onto every rule: they are per-question, and `enabled` must survive on a question whose rules are
 * stored but switched off — legacy's `toggleNarrative` flips `have_narrative` **without** clearing
 * `conditional[]`, so "disabled but not cleared" is a real stored state.
 *
 * Both members are `true`-only: DOC-LAW-2 makes `false` and absent the same thing, so writing
 * `false` would be a second encoding of "not set" and would change `document_hash`.
 */
export type HighlightRuleSettings = { enabled?: true; requiredAll?: true }
export type NarrativeRule = { condition: RuleCondition; [key: string]: unknown }
export type QnrRule = {
    condition: RuleCondition
    /** A `qnr_templates.id` family reference; pinned versions are intentionally unrepresentable. */
    templateFamilyId: string
}

/**
 * An answer-prefill rule (M-068): when the source question has an answer and this rule's target is
 * still empty, the target is filled from it.
 *
 * **Not a visibility rule**, which is the whole reason it is its own collection: legacy
 * `dependent_questions` propagates a *value*, so mapping it onto `visibilityRules` would make v2
 * *hide* a question legacy merely *prefilled*. Carries no `condition` for the same reason — there is
 * no operator to evaluate, only a source address.
 *
 * The address is two-level because a source inside a grid needs its enclosing grid to be resolvable:
 * `sourceParentQuestionId` is that grid, absent for a top-level source.
 *
 * Evaluation (fill once, never overwrite an existing answer) is runtime behaviour owned by
 * ASMA-7935; the document only preserves the authored rule.
 */
export type PrefillRule = {
    sourceQuestionId: QuestionId
    sourceParentQuestionId?: QuestionId
    [key: string]: unknown
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

/**
 * A binding's expected cardinality (§13.1). Closed rather than a loose string because the compiler
 * branches on it: `0..1`/`1` fill one slot, `0..*`/`1..*` feed a grid's rows, and a typo would compile
 * into an artifact that is immutable forever.
 *
 * `0..1` is the default, so DOC-LAW-2 means it is **never stored** — a binding that takes at most one
 * value carries no `cardinality` key at all.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-15-20-38-analysis-qnr-external-data-mapping-options.md:840 — the four values
 */
export const BINDING_CARDINALITIES = ['0..1', '1', '0..*', '1..*'] as const
export type BindingCardinality = (typeof BINDING_CARDINALITIES)[number]

/**
 * What the runtime does when the source yields **no** value for a binding. `omit` leaves the question
 * unfilled (the default); `error` makes the absence a prefill failure the author wants surfaced rather
 * than silently tolerated.
 */
export const BINDING_ON_MISSING = ['omit', 'error'] as const
export type BindingOnMissing = (typeof BINDING_ON_MISSING)[number]

/**
 * What the runtime does when the source yields **many** values for a binding expecting one. `error` is
 * the default — an ambiguous prefill is a real defect — and `first` is the deliberate opt-in, which is
 * why the node's `orderBy` must make "first" deterministic before it means anything.
 */
export const BINDING_ON_MANY = ['error', 'first'] as const
export type BindingOnMany = (typeof BINDING_ON_MANY)[number]

/**
 * The three binding behaviours and their defaults, in one place because two rules depend on it: the
 * reducer omits a chosen value that equals its default (DOC-LAW-2 — a key present with its own default
 * is a second encoding of "not set", and the hash is computed on the minimal form), and every reader
 * hydrates the absent key back to the same value.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-15-20-38-analysis-qnr-external-data-mapping-options.md:832 — absent because they equal their defaults
 */
/** The binding behaviours a reader sees — total, because the stored document is minimal. */
export type ResolvedBindingOptions = {
    cardinality: BindingCardinality
    onMissing: BindingOnMissing
    onMany: BindingOnMany
}

export const BINDING_OPTION_DEFAULTS = {
    cardinality: '0..1',
    onMissing: 'omit',
    onMany: 'error',
} as const satisfies ResolvedBindingOptions

export type MappingBinding = {
    nodeId: NodeId
    fieldId: string
    target: BindingTarget
    /** Absent means `0..1` (BINDING_OPTION_DEFAULTS) — never stored at its default. */
    cardinality?: BindingCardinality
    /** Absent means `omit`. */
    onMissing?: BindingOnMissing
    /** Absent means `error`. */
    onMany?: BindingOnMany
    [key: string]: unknown
}

/**
 * Hydrates a stored binding's behaviours to the total set (§2.2a: "the hydrated in-memory binding is
 * a total object"). One place rather than `?? 'omit'` at each use site — a reader that spelled the
 * fallback itself would be a second declaration of the default, free to drift from the reducer's.
 */
export const resolveBindingOptions = (binding: MappingBinding): ResolvedBindingOptions => ({
    cardinality: binding.cardinality ?? BINDING_OPTION_DEFAULTS.cardinality,
    onMissing: binding.onMissing ?? BINDING_OPTION_DEFAULTS.onMissing,
    onMany: binding.onMany ?? BINDING_OPTION_DEFAULTS.onMany,
})

/** Whether a binding's cardinality means "many values", i.e. it feeds a grid's rows rather than one slot. */
export const bindingIsMultiValued = (binding: MappingBinding): boolean =>
    resolveBindingOptions(binding).cardinality.endsWith('*')

/** Carries no `nodeId` back-pointer: the node already lists it (§2.2a). */
/** The operators the typed path authors and the compiler branches on (engine contract ENG-MD-005). */
export const MAPPING_FILTER_OPERATORS = ['eq', 'in', 'range', 'isNull'] as const
export type MappingFilterOperator = (typeof MAPPING_FILTER_OPERATORS)[number]

export const isKnownMappingFilterOperator = (operator: unknown): operator is MappingFilterOperator =>
    typeof operator === 'string' && (MAPPING_FILTER_OPERATORS as readonly string[]).includes(operator)

/**
 * The payload each known operator carries — one member set per operator, nothing shared.
 *
 * `range` takes at least one bound because a range with neither is not a filter; `in` takes a
 * non-empty list for the same reason. Both are enforced by the schema rather than left to the reducer,
 * so an unusable filter cannot reach a compiled artifact.
 */
export type MappingFilterPayload =
    | { operator: 'eq'; value: DocScalar }
    | { operator: 'in'; values: DocScalar[] }
    | { operator: 'range'; from: DocScalar; to?: DocScalar }
    | { operator: 'range'; to: DocScalar }
    | { operator: 'isNull'; value: boolean }

/**
 * A node filter. Carries no `nodeId` back-pointer: the node already lists it (§2.2a).
 *
 * **`operator` stays a loose `string`, and that is deliberate.** It is released, and stored documents
 * carry operators outside the closed set (`contains` among them) that must remain readable and
 * replayable — ADR-0008 DEC-006. The closed vocabulary arrives as `MAPPING_FILTER_OPERATORS` plus the
 * additive `mappingFilter.setTyped`, which is the only path that can write a payload; publication is
 * where an unknown operator becomes a refusal.
 *
 * `values`/`from`/`to` are additive members for the `in` and `range` payloads. A filter carries only
 * the members of its own operator: `setTyped` rewrites the record rather than patching it, so
 * switching operator cannot leave a stale `value` behind.
 */
export type MappingFilter = {
    fieldId: string
    operator: string
    value?: DocScalar
    values?: DocScalar[]
    from?: DocScalar
    to?: DocScalar
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
    /** Keyed by the **target** question — the one that gets filled (M-068). */
    prefillRulesById?: Record<PrefillRuleId, PrefillRule>
    prefillRuleOrderByQuestionId?: Record<QuestionId, PrefillRuleId[]>
    /** Only for a question that actually sets one of them; an all-default entry is omitted. */
    highlightRuleSettingsByQuestionId?: Record<QuestionId, HighlightRuleSettings>
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
    /**
     * The carried tabs in authored order — the one order this bundle could not state.
     *
     * Every other collection here already pairs its record with an order (`gridRowOrderByQuestionId`,
     * `alternativeOrderByQuestionId`) or derives one (a column's place is its position in the owning
     * grid's `grid.columnIds`; actions are a set by design, architecture §2.1). Tabs had neither, and
     * **key order is not an order contract**: `qnr_question_templates.bundle` is `jsonb`, which
     * normalizes object keys by length then bytes, so a two-tab bundle authored `t-zulu, t-alfa` reads
     * back `t-alfa, t-zulu`. Measured on PostgreSQL 17, and the same payload as `json` keeps the
     * authored order — so this is the column type destroying it, not the client sending it wrong.
     *
     * Consequence for the pick: a pick synthesizes one `tab.create` per tab and `tab.create` appends,
     * so emission order *is* the resulting `tabOrder` in the live template. Without this member the
     * only choices were to sort by id or to trust key order — both invent an order the author never
     * chose, and the tab bar is something they look at.
     *
     * Optional because a bundle with fewer than two tabs has no order to state; the library's
     * validator is where "two or more tabs must declare it" belongs, since that is the writer's rule
     * rather than a property of the shape.
     */
    tabOrder?: TabId[]
    actionsById?: Record<ActionId, QnrAction>
    /**
     * The mapping-graph fragment its questions are bound through — the same four normalized
     * collections the document root carries, scoped to this root question's subtree.
     *
     * **Why a bundle carries mapping at all.** Mapping is one root-level graph, not per-question state
     * (OQ-V2-28 ✅, §2.2a), so a bundle that copied only questions would lose every binding the moment
     * it was picked: the pick splices this fragment into the family document's root graph precisely so
     * a picked question does not arrive unmapped. The pre-DDL guardrails state it as part of what the
     * column stores — "plus its mapping-graph fragment (the nodes, bindings, and filters its questions
     * are bound through)".
     *
     * The same records and the same laws as the document, deliberately: `dataMappingsById` keyed by
     * mapping id with a primitive `bindingOrder`, nodes keyed by node id with a primitive `filterOrder`,
     * every default omitted. **No new document shape** — a pick replays ordinary authoring ops under
     * fresh ids (`mappingNode.create`, then filters via `mappingFilter.set` or the typed
     * `mappingFilter.setTyped`, then `mappingBinding.create`, and `dataMapping.create` last so the
     * reducer adopts its bindings in the authored order), so anything expressible in a document is
     * expressible in a bundle and nothing else is.
     *
     * All four are optional and independently so: a bundle for an unmapped question carries none of
     * them, and a fragment mid-authoring may carry nodes with no bindings yet. Completeness is a
     * publication question (G-25), never a condition of storing or picking one.
     *
     * @see asma-modules/_docs/editor/qnrs/cross/2026-07-13-23-25-architecture-qnr-v2-db-design-pre-ddl-guardrails.md:187
     * @see asma-modules/_docs/editor/qnrs/cross/2026-07-13-23-25-architecture-qnr-v2-db-design-pre-ddl-guardrails.md:587 — OQ-V2-28
     */
    dataMappingsById?: Record<MappingId, QnrDataMapping>
    mappingNodesById?: Record<NodeId, MappingNode>
    mappingBindingsById?: Record<BindingId, MappingBinding>
    mappingFiltersById?: Record<FilterId, MappingFilter>
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
