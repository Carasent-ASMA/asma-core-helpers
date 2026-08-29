import type {
    ActionId,
    ActionMetadata,
    ActionType,
    AltId,
    AlternativeChartLegendSelection,
    BindingCardinality,
    BindingId,
    BindingOnMany,
    BindingOnMissing,
    BindingTarget,
    DocScalar,
    FilterId,
    HighlightRuleId,
    LayoutPlacement,
    LegacyBindingOverride,
    MappingFilterPayload,
    MappingId,
    NarrativeRuleId,
    NodeId,
    QuestionId,
    QnrRuleId,
    RowId,
    RuleCondition,
    TabId,
    VisibilityRuleId,
} from './templateDocument.js'
import type { QuestionType } from './questionTypes.js'

/**
 * The authoring op vocabulary (architecture §5). `entity.action`, stable-id targets only, append-only —
 * a new op is a new member, never a changed one.
 *
 * `null` in an op payload is the **explicit unset** the way JSON-merge-patch uses it.
 * DOC-LAW-2 bans `null` in the stored document, not in the op that produces it: the op
 * layer is the only place the absent-vs-cleared tri-state survives.
 *
 * Two move conventions coexist deliberately: `question.move`/`alternative.move`/`tab.move`
 * carry `toIndex` (the established authoring shape), while `gridRow.move` is
 * **anchor-relative** (`afterRowId`, OQ-V2-24) — array position is never identity, and a
 * row index would denote different rows to two clients that disagree by one insert.
 *
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:380 (op vocabulary)
 * @see asma-modules/_docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 (DOC-LAW-2 tri-state)
 */

/**
 * A value an op may write. `null` means unset. A primitive ARRAY is legal (DOC-LAW-1
 * allows arrays of primitives: order arrays, `grid.columnIds`, filter orders) and is
 * written wholesale — it is never merged member-wise.
 */
export type OpValue = DocScalar | DocScalar[] | null

export type TemplateOp =
    | { type: 'template.updateMeta'; patch: Record<string, OpValue | Record<string, unknown>> }
    | {
          type: 'template.updateSettings'
          /** Dotted-path patch into `meta.settings` (journal wiring, recipient requirements). */
          patch: Record<string, OpValue | Record<string, unknown>>
      }
    // `questionType`, not `type`: the envelope already owns `type` for the op name, so the question's
    // own type (which is what lands in the document) needs a distinct key here.
    | { type: 'question.create'; questionId: QuestionId; questionType: QuestionType; atIndex?: number }
    | { type: 'question.updateField'; questionId: QuestionId; field: string; value: OpValue }
    | { type: 'question.move'; questionId: QuestionId; toIndex: number }
    | { type: 'question.delete'; questionId: QuestionId }
    | {
          type: 'gridColumn.create'
          questionId: QuestionId
          columnQuestionId: QuestionId
          questionType: QuestionType
          atIndex?: number
      }
    | { type: 'gridColumn.move'; questionId: QuestionId; columnQuestionId: QuestionId; toIndex: number }
    | {
          type: 'gridColumn.setLayout'
          questionId: QuestionId
          columnQuestionId: QuestionId
          placement: LayoutPlacement | null
      }
    /**
     * Adds, moves or removes one column in the grid's filter selection (M-054).
     *
     * Member-wise rather than a whole-list write, which is the difference that makes concurrent
     * authoring work: two authors adding different filters produce two edits to the *current* list, so
     * both survive. A `filterQuestionIds` array written wholesale would have the second overwrite the
     * first with no conflict raised — the same reason DOC-LAW-1 keys collections by id.
     *
     * `include: true` inserts (at `atIndex`, else appends) and **moves** an id already present when
     * `atIndex` is given; `include: false` removes it. An emptied list is omitted, per DOC-LAW-2.
     */
    | {
          type: 'gridColumn.setFilter'
          questionId: QuestionId
          columnQuestionId: QuestionId
          include: boolean
          atIndex?: number
      }
    /** The same member-wise semantics for the grid's owned action ids (M-055). Ids only, never bodies. */
    | {
          type: 'gridColumn.setAction'
          questionId: QuestionId
          actionId: ActionId
          include: boolean
          atIndex?: number
      }
    // Authoring-side grid rows are the template's *predefined* rows; instance-added rows
    // are answer ops (answerOperations.ts). `gridRow.move` is anchor-relative (OQ-V2-24).
    | { type: 'gridRow.create'; questionId: QuestionId; rowId: RowId; label?: string; atIndex?: number }
    | { type: 'gridRow.move'; questionId: QuestionId; rowId: RowId; afterRowId: RowId | null }
    | { type: 'gridRow.delete'; questionId: QuestionId; rowId: RowId }
    | {
          type: 'gridRow.updateCell'
          questionId: QuestionId
          rowId: RowId
          columnQuestionId: QuestionId
          value: OpValue
      }
    | { type: 'alternative.create'; questionId: QuestionId; alternativeId: AltId; label?: string; atIndex?: number }
    /**
     * Renaming is its own operation rather than delete-then-create because an alternative's id is
     * referenced by every answer that selected it — recreating it under a new id is how the legacy
     * data ended up with ~11,000 answers pointing at options that no longer exist.
     */
    | { type: 'alternative.updateField'; questionId: QuestionId; alternativeId: AltId; field: string; value: OpValue }
    | { type: 'alternative.move'; questionId: QuestionId; alternativeId: AltId; toIndex: number }
    | { type: 'alternative.delete'; questionId: QuestionId; alternativeId: AltId }
    /**
     * Writes an Expression alternative's formula text and its ordered target list as one value (AC-9).
     *
     * One operation rather than two `alternative.updateField` writes: the formula and the targets it
     * cites are one authored decision, and a client that landed the text but lost the list would leave a
     * formula referencing questions the document does not record as targets.
     *
     * On an `ExpressionQuestion` the formula genuinely lives in the alternative's `value` — the usual
     * "an alternative's value is read-only code" rule does not hold for this type, because that is where
     * legacy's formula editor writes.
     *
     * Deliberately draft-permissive: the text and the list need not agree while editing, so a
     * half-typed formula saves. Publication and preview own the mismatch finding; the reducer must not
     * erase or repair a partial formula the author is still writing.
     */
    | {
          type: 'alternative.setExpressionFormula'
          questionId: QuestionId
          alternativeId: AltId
          value: string
          expressionTargets: QuestionId[]
      }
    /**
     * Creates one radar Chart legend, inserting its keyed record and its order entry atomically (AC-9).
     *
     * Atomic because a legend present in `legendsById` but absent from `legendsOrder` is unreachable
     * state that still moves `document_hash`, and the reverse dangles. `atIndex` exists so a bundle pick
     * can restore authored order losslessly; the app appends, because legacy exposes no reorder control.
     */
    | { type: 'chartLegend.create'; questionId: QuestionId; legendId: string; label: string; atIndex?: number }
    /**
     * Removes one Chart legend, its order entry, and every assignment on that Chart's own alternatives.
     *
     * The cascade matches the legacy effect — a legend that disappears stops appearing on alternatives —
     * and stops at ownership: an identically-named legend id on another question is left alone, which
     * matters because imported ids can collide across questions.
     */
    | { type: 'chartLegend.delete'; questionId: QuestionId; legendId: string }
    /**
     * Binds one Chart alternative to one legend and one expression-enabled target, or clears it (AC-9).
     *
     * The payload carries no `label`: the reducer copies it from the owning legend. Accepting one would
     * let a client give a single legend id two labels, i.e. two hashes for one authored state.
     *
     * A whole object rather than three field writes, for the same reason `tab.setLayout` is atomic —
     * separate id/target/label writes can interleave into a hybrid no author ever selected. `null`
     * clears whatever is stored, including an imported dangling or non-radar assignment, so the
     * operation stays usable for repair.
     */
    | {
          type: 'alternative.setChartLegend'
          questionId: QuestionId
          alternativeId: AltId
          chartLegend: AlternativeChartLegendSelection | null
      }
    | { type: 'tab.create'; tabId: TabId; label?: string; atIndex?: number }
    | { type: 'tab.updateField'; tabId: TabId; field: string; value: OpValue }
    | { type: 'tab.move'; tabId: TabId; toIndex: number }
    /**
     * Writes one question's placement inside a tab's positional grid atomically (M-051).
     *
     * `{row, cell, keepCellSize}` moves as one value, which `tab.updateField` cannot express — an
     * `OpValue` is a scalar or a primitive array — so two dotted updates would be the alternative, and
     * a client that landed one and lost the other would leave a row/cell hybrid the author never
     * authored. `placement: null` clears the entry. Concurrent moves of *different* questions both
     * survive; concurrent moves of the *same* question are last-writer-wins on a whole placement.
     */
    | { type: 'tab.setLayout'; tabId: TabId; questionId: QuestionId; placement: LayoutPlacement | null }
    /**
     * Adds, moves or removes one question in a tab's authored membership (freeze §3a).
     *
     * Member-wise for the reason `gridColumn.setFilter` is: `tab.updateField` would write the whole
     * `questionIds` array, so two authors adding different questions would produce two whole-array
     * patches and the second would silently discard the first. `include:false` also removes the id from
     * `rowCountQuestionIds` and from `layout.placementsByQuestionId`, because a count or a placement for
     * a non-member is a reference to something the tab no longer shows.
     */
    | { type: 'tab.setQuestion'; tabId: TabId; questionId: QuestionId; include: boolean; atIndex?: number }
    /**
     * Adds, moves or removes one `QuestionGrid` in the subset whose rows contribute to a tab's count.
     *
     * `include:true` requires an existing `QuestionGrid` already in that tab's `questionIds` — a count
     * over a non-member, or over a question with no rows, is not a state an author can mean.
     * `include:false` requires neither, so an imported document whose count names a missing or
     * wrong-typed question stays repairable.
     */
    | { type: 'tab.setRowCountQuestion'; tabId: TabId; questionId: QuestionId; include: boolean; atIndex?: number }
    | { type: 'tab.delete'; tabId: TabId }
    // Actions are a set, not an ordered collection (architecture §2.1: `actionsById`, no order array).
    | { type: 'action.create'; actionId: ActionId; kind?: string }
    | { type: 'action.updateField'; actionId: ActionId; field: string; value: OpValue }
    /**
     * Creates a **known** action in minimal form, discriminated by kind.
     *
     * Separate from `action.create` (which stays as released, accepting any `kind` string) because the
     * typed path is closed: it cannot mint a UI edit buffer, and it cannot create a kind the reducer
     * has no rules for. Kind is write-once — `action.updateField` refuses to change it.
     */
    /**
     * Two closed arms, not one arm with an optional member: `actionType` is a `gridAction` concept, and a
     * single arm would type-check `{kind: 'topLevelAction', actionType: 'COPY'}` — leaving the reducer as
     * the only thing that noticed, which is a runtime refusal for something the compiler can prevent.
     */
    | { type: 'action.createTyped'; actionId: ActionId; kind: 'topLevelAction'; label?: string; actionType?: never }
    | {
          type: 'action.createTyped'
          actionId: ActionId
          kind: 'gridAction'
          label?: string
          /** A valid draft may omit it; publication is where that is refused. */
          actionType?: ActionType
      }
    /**
     * Adds, moves or removes one grid-action id inside a top-level action's per-grid sequence (M-052).
     *
     * `topLevelAction`-only, member-wise for the same concurrency reason as the grid lists. An emptied
     * sequence drops its grid key, and an emptied map is omitted (DOC-LAW-2).
     */
    | {
          type: 'action.setGridActionRef'
          actionId: ActionId
          gridQuestionId: QuestionId
          gridActionId: ActionId
          include: boolean
          atIndex?: number
      }
    /**
     * Writes or clears one column's metadata on a grid action (M-055).
     *
     * `gridAction`-only. `null` removes the entry; a payload is written canonically, so `{all: true}`
     * stays exclusive with `from`/`to` and an empty object never reaches the document.
     */
    | { type: 'action.setMetadata'; actionId: ActionId; questionId: QuestionId; metadata: ActionMetadata | null }
    | { type: 'action.delete'; actionId: ActionId }
    // One entry per mapping root (§2.2a): the root node must exist first (structure pass),
    // the mapping attaches it to a source (mapping pass). Delete cascades the whole tree.
    | { type: 'dataMapping.create'; mappingId: MappingId; sourceId: string; rootNodeId: NodeId }
    | { type: 'dataMapping.delete'; mappingId: MappingId }
    | { type: 'mappingNode.create'; nodeId: NodeId; entityId: string; parentNodeId?: NodeId; relationshipId?: string }
    | {
          type: 'mappingNode.update'
          nodeId: NodeId
          patch: {
              entityId?: string
              /** `null` explicitly unsets — the node becomes a root. */
              parentNodeId?: NodeId | null
              relationshipId?: string | null
              filterOrder?: FilterId[]
          }
      }
    | { type: 'mappingNode.delete'; nodeId: NodeId }
    /**
     * The three behaviours are optional here and **omitted from the document when they equal their
     * default** (DOC-LAW-2, `BINDING_OPTION_DEFAULTS`): the op carries what the author chose, the
     * document stores only what differs. Authoring them is the point — a binding whose behaviour
     * could not be stated would leave the compiler to guess what happens when the source yields
     * nothing or yields many.
     */
    | {
          type: 'mappingBinding.create'
          bindingId: BindingId
          nodeId: NodeId
          fieldId: string
          target: BindingTarget
          cardinality?: BindingCardinality
          onMissing?: BindingOnMissing
          onMany?: BindingOnMany
      }
    /**
     * `null` on a behaviour is the explicit unset — the author returned it to the default, which the
     * document encodes as absence. Without the tri-state "back to default" would be unexpressible:
     * omitting the member from the patch means "leave it alone", which is a different edit.
     */
    | {
          type: 'mappingBinding.update'
          bindingId: BindingId
          patch: {
              nodeId?: NodeId
              fieldId?: string
              target?: BindingTarget
              cardinality?: BindingCardinality | null
              onMissing?: BindingOnMissing | null
              onMany?: BindingOnMany | null
          }
      }
    | { type: 'mappingBinding.delete'; bindingId: BindingId }
    /**
     * Sets or clears one binding's legacy mapping exception (OQ-V2-40, freeze §1a).
     *
     * Accepts only the closed {@link LegacyBindingOverride} or `null`, while the stored member stays
     * `unknown` on read: new producers may write nothing but canonical, and historical arbitrary values
     * keep replaying byte-for-byte through the untouched `create`/`update` arms.
     *
     * Member-only by construction — it cannot reach `nodeId`, `fieldId`, `target`, the behaviour options
     * or any mapping's `bindingOrder`, so repairing an exception can never disturb the graph. `null`
     * removes the member and leaves no empty object behind.
     */
    | { type: 'mappingBinding.setLegacyOverride'; bindingId: BindingId; legacyOverride: LegacyBindingOverride | null }
    | {
          type: 'mappingFilter.set'
          filterId: FilterId
          nodeId: NodeId
          fieldId: string
          operator: string
          value?: DocScalar
      }
    /**
     * Sets a filter to one **closed** operator and exactly that operator's payload.
     *
     * Additive beside `mappingFilter.set`, which stays byte-for-byte as released so stored `contains`
     * filters keep replaying. The reducer REPLACES the record rather than patching it, so switching
     * `eq` → `in` cannot leave a stale `value` next to the new `values`; a filter therefore always
     * carries the members of its own operator and no others.
     */
    | ({ type: 'mappingFilter.setTyped'; filterId: FilterId; nodeId: NodeId; fieldId: string } & MappingFilterPayload)
    | { type: 'mappingFilter.delete'; filterId: FilterId }
    | { type: 'visibilityRule.set'; ruleId: VisibilityRuleId; questionId: QuestionId; condition: RuleCondition }
    | { type: 'visibilityRule.delete'; ruleId: VisibilityRuleId }
    | { type: 'highlightRule.set'; ruleId: HighlightRuleId; questionId: QuestionId; condition: RuleCondition }
    | { type: 'highlightRule.delete'; ruleId: HighlightRuleId }
    | { type: 'narrativeRule.set'; ruleId: NarrativeRuleId; questionId: QuestionId; condition: RuleCondition }
    | { type: 'narrativeRule.delete'; ruleId: NarrativeRuleId }
    | {
          type: 'qnrRule.set'
          ruleId: QnrRuleId
          questionId: QuestionId
          condition: RuleCondition
          /** Family id only (OQ-F18/M-066); there is deliberately no version member. */
          templateFamilyId: string
      }
    | { type: 'qnrRule.delete'; ruleId: QnrRuleId }

export type TemplateOpType = TemplateOp['type']

/**
 * The op types this reducer implements. Declared as a total `Record` over the union
 * rather than a bare list, so **omitting an op is a compile error**. `satisfies readonly
 * TemplateOpType[]` only rejected entries that are not op types; it could not notice a
 * missing one, and this list is what downstream validators are built against — an op
 * absent here is an op the server rejects at runtime with nothing red anywhere first.
 */
const OP_TYPE_COVERAGE: Record<TemplateOpType, true> = {
    'template.updateMeta': true,
    'template.updateSettings': true,
    'question.create': true,
    'question.updateField': true,
    'question.move': true,
    'question.delete': true,
    'gridColumn.create': true,
    'gridColumn.move': true,
    'gridColumn.setLayout': true,
    'gridColumn.setFilter': true,
    'gridColumn.setAction': true,
    'gridRow.create': true,
    'gridRow.move': true,
    'gridRow.delete': true,
    'gridRow.updateCell': true,
    'alternative.create': true,
    'alternative.updateField': true,
    'alternative.move': true,
    'alternative.delete': true,
    'alternative.setExpressionFormula': true,
    'alternative.setChartLegend': true,
    'chartLegend.create': true,
    'chartLegend.delete': true,
    'tab.create': true,
    'tab.updateField': true,
    'tab.move': true,
    'tab.setLayout': true,
    'tab.setQuestion': true,
    'tab.setRowCountQuestion': true,
    'tab.delete': true,
    'action.create': true,
    'action.updateField': true,
    'action.createTyped': true,
    'action.setGridActionRef': true,
    'action.setMetadata': true,
    'action.delete': true,
    'dataMapping.create': true,
    'dataMapping.delete': true,
    'mappingNode.create': true,
    'mappingNode.update': true,
    'mappingNode.delete': true,
    'mappingBinding.create': true,
    'mappingBinding.update': true,
    'mappingBinding.delete': true,
    'mappingBinding.setLegacyOverride': true,
    'mappingFilter.set': true,
    'mappingFilter.setTyped': true,
    'mappingFilter.delete': true,
    'visibilityRule.set': true,
    'visibilityRule.delete': true,
    'highlightRule.set': true,
    'highlightRule.delete': true,
    'narrativeRule.set': true,
    'narrativeRule.delete': true,
    'qnrRule.set': true,
    'qnrRule.delete': true,
}

export const IMPLEMENTED_OP_TYPES = Object.keys(OP_TYPE_COVERAGE) as readonly TemplateOpType[]
