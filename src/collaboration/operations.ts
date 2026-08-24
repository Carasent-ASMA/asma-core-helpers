import type {
    ActionId,
    ActionMetadata,
    ActionType,
    AltId,
    BindingCardinality,
    BindingId,
    BindingOnMany,
    BindingOnMissing,
    BindingTarget,
    DocScalar,
    FilterId,
    HighlightRuleId,
    LayoutPlacement,
    MappingFilterPayload,
    MappingId,
    NarrativeRuleId,
    NodeId,
    QuestionId,
    QnrRuleId,
    KnownActionKind,
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
    | {
          type: 'action.createTyped'
          actionId: ActionId
          kind: KnownActionKind
          label?: string
          /** `gridAction` only; a valid draft may omit it, and publication is where that is refused. */
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
    'tab.create': true,
    'tab.updateField': true,
    'tab.move': true,
    'tab.setLayout': true,
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
