import type { AltId, BindingId, BindingTarget, DocScalar, FilterId, NodeId, QuestionId } from './templateDocument.js'
import type { QuestionType } from './questionTypes.js'

/**
 * The authoring op vocabulary. `entity.action`, stable-id targets only, append-only —
 * a new op is a new member, never a changed one.
 *
 * `null` in an op payload is the **explicit unset** the way JSON-merge-patch uses it.
 * DOC-LAW-2 bans `null` in the stored document, not in the op that produces it: the op
 * layer is the only place the absent-vs-cleared tri-state survives.
 *
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:380
 * @see _docs/editor/qnrs/cross/2026-07-12-20-20-architecture-qnr-v2-model-collaboration-sync.md:195 (DOC-LAW-2 tri-state)
 */

/** A value an op may write. `null` means unset. */
export type OpValue = DocScalar | null

export type TemplateOp =
    | { type: 'template.updateMeta'; patch: Record<string, OpValue | Record<string, unknown>> }
    // `questionType`, not `type`: the envelope already owns `type` for the op name, so the question's
    // own type (which is what lands in the document) needs a distinct key here.
    | { type: 'question.create'; questionId: QuestionId; questionType: QuestionType; atIndex?: number }
    | { type: 'question.updateField'; questionId: QuestionId; field: string; value: OpValue }
    | { type: 'question.move'; questionId: QuestionId; toIndex: number }
    | { type: 'question.delete'; questionId: QuestionId }
    | { type: 'alternative.create'; questionId: QuestionId; alternativeId: AltId; label?: string; atIndex?: number }
    | { type: 'alternative.delete'; questionId: QuestionId; alternativeId: AltId }
    | { type: 'mappingNode.create'; nodeId: NodeId; entityId: string; parentNodeId?: NodeId; relationshipId?: string }
    | { type: 'mappingNode.delete'; nodeId: NodeId }
    | {
          type: 'mappingBinding.create'
          bindingId: BindingId
          nodeId: NodeId
          fieldId: string
          target: BindingTarget
      }
    | {
          type: 'mappingBinding.update'
          bindingId: BindingId
          patch: { nodeId?: NodeId; fieldId?: string; target?: BindingTarget }
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
    | { type: 'mappingFilter.delete'; filterId: FilterId }

export type TemplateOpType = TemplateOp['type']

/**
 * The op types this reducer implements. The vocabulary in the architecture doc is
 * larger (grid rows, tabs, actions, layout, visibility/highlight rules); those slot
 * into the same registry without changing the envelope.
 */
export const IMPLEMENTED_OP_TYPES = [
    'template.updateMeta',
    'question.create',
    'question.updateField',
    'question.move',
    'question.delete',
    'alternative.create',
    'alternative.delete',
    'mappingNode.create',
    'mappingNode.delete',
    'mappingBinding.create',
    'mappingBinding.update',
    'mappingBinding.delete',
    'mappingFilter.set',
    'mappingFilter.delete',
] as const satisfies readonly TemplateOpType[]
