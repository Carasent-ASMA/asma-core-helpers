import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type } from 'arktype'

import { canonicalJson, hashCanonical, reduceToMinimalForm } from './canonicalize.js'
import { findDocLawViolations } from './docLaws.js'
import { emptyTemplateDocument, type QnrTemplateDocument } from './templateDocument.js'
import { IMPLEMENTED_ANSWER_OP_TYPES } from './answerOperations.js'
import { IMPLEMENTED_OP_TYPES } from './operations.js'
import {
    SCHEMA_ANSWER_OP_TYPES,
    SCHEMA_TEMPLATE_OP_TYPES,
    answerOpSchema,
    findAnswerSchemaDocLawViolations,
    findDocLawDefaultViolations,
    findDuplicateBindingTargets,
    findQuestionOwnershipViolations,
    findSchemaDocLawViolations,
    findTemplateDocumentContractViolations,
    findTemplateSchemaDocLawViolations,
    qnrAnswerDocumentSchema,
    qnrTemplateDocumentSchema,
    templateAuthoringIsDefault,
    templateDocumentIsDefault,
    templateDocumentIsDefaultV0281,
    templateOpSchema,
    validateTemplateDocument,
} from './schemas.js'

/**
 * The TASK-003 contract tests: the schemas accept exactly the minimal documents, the schema
 * lint proves the document laws by construction, and the op schemas stay in lockstep with
 * the TS vocabularies.
 */

describe('document schemas', () => {
    it('accepts the empty template document', () => {
        const result = validateTemplateDocument(emptyTemplateDocument('tpl-1'))
        assert.ok(result.ok)
        assert.equal(result.value.revision, 0)
    })

    it('rejects explicit null and unknown question types', () => {
        const withNull = validateTemplateDocument({
            ...emptyTemplateDocument('tpl-1'),
            meta: { title: null },
        } as unknown as QnrTemplateDocument)
        assert.equal(withNull.ok, false)

        const withUnknownType = validateTemplateDocument({
            ...emptyTemplateDocument('tpl-1'),
            questionsById: { 'q-1': { type: 'NotAQuestionType' } },
        } as unknown as QnrTemplateDocument)
        assert.equal(withUnknownType.ok, false)
    })

    it('leaves empty-collection rejection to the instance lint (DOC-LAW-2, layered)', () => {
        // The schema validates shape and type; "no empty collections" is the instance lint's
        // job (findDocLawViolations) because the schema cannot express non-empty arrays.
        const doc = { ...emptyTemplateDocument('tpl-1'), tabOrder: [] } as QnrTemplateDocument
        const result = validateTemplateDocument(doc)
        assert.ok(result.ok)
        const violations = findTemplateDocumentContractViolations(doc)
        assert.ok(violations.some((v) => v.law === 'DOC-LAW-2' && v.path === 'tabOrder'))
    })

    it('accepts a fully-populated document in minimal form', () => {
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 3,
            meta: {
                title: 'Test',
                instancePolicy: { requiredAccessLevel: 4, initiator: 'coordinator' },
            },
            questionsById: {
                'q-1': { type: 'QuestionGrid', grid: { columnIds: ['c-1'], singleRow: true } },
                'c-1': { type: 'TextShort', required: true },
            },
            questionOrder: ['q-1'],
            gridRowOrderByQuestionId: { 'q-1': ['r-1'] },
            gridRowsById: { 'r-1': { label: 'Row' } },
            alternativesById: { 'a-1': { label: 'Ja' } },
            alternativeOrderByQuestionId: { 'q-1': ['a-1'] },
            tabsById: { 't-1': { label: 'Tab' } },
            tabOrder: ['t-1'],
            actionsById: { 'x-1': { kind: 'submit' } },
            visibilityRulesById: { 'vr-1': { condition: { sourceQuestionId: 'q-1', value: 'x' } } },
            visibilityRuleOrderByQuestionId: { 'q-1': ['vr-1'] },
            highlightRulesById: { 'hr-1': { condition: { sourceQuestionId: 'q-1' } } },
            highlightRuleOrderByQuestionId: { 'q-1': ['hr-1'] },
            dataMappingsById: { 'm-1': { sourceId: 'adopus-legacy', rootNodeId: 'n-1', bindingOrder: ['b-1'] } },
            mappingNodesById: { 'n-1': { entityId: 'Actor' } },
            mappingBindingsById: {
                'b-1': { nodeId: 'n-1', fieldId: 'Navn', target: { kind: 'question', questionId: 'q-1' } },
            },
            mappingFiltersById: { 'f-1': { fieldId: 'Status', operator: 'eq', value: 'Active' } },
        }

        const result = validateTemplateDocument(doc)
        assert.ok(result.ok, result.ok ? '' : result.summary)
        assert.equal(findDocLawDefaultViolations(doc).length, 0)
    })
})

describe('question ownership invariant', () => {
    it('admits `grid` on a question grid alone', () => {
        const withGrid = (type: string): QnrTemplateDocument =>
            ({
                ...emptyTemplateDocument('tpl-1'),
                questionsById: { 'q-1': { type, grid: { columnIds: ['c-1'] } }, 'c-1': { type: 'TextShort' } },
                questionOrder: ['q-1'],
            }) as unknown as QnrTemplateDocument

        assert.equal(validateTemplateDocument(withGrid('QuestionGrid')).ok, true)
        // The per-type bag is open, so this is the one shape validation must NOT wave through:
        // `columnIds` is ownership, and an ordinary question owning questions is unrepresentable.
        assert.equal(validateTemplateDocument(withGrid('TextShort')).ok, false)
        // The rest of the bag is untouched — an unknown per-type key is still an open extension.
        assert.equal(
            validateTemplateDocument({
                ...emptyTemplateDocument('tpl-1'),
                questionsById: { 'q-1': { type: 'TextShort', dropdown: { multi: true } } },
                questionOrder: ['q-1'],
            } as unknown as QnrTemplateDocument).ok,
            true,
        )
    })

    it('does not read a non-grid question as a column owner', () => {
        // The publication gate refuses on any violation, so a stray `grid` on an ordinary
        // question must not be able to *satisfy* ownership for the question it lists: that would
        // hide the orphan instead of reporting it.
        const doc = {
            documentId: 'tpl-1',
            revision: 0,
            questionsById: {
                'q-1': { type: 'TextShort', grid: { columnIds: ['c-1'] } },
                'c-1': { type: 'TextShort' },
            },
            questionOrder: ['q-1'],
        } as unknown as QnrTemplateDocument

        assert.deepEqual(findQuestionOwnershipViolations(doc), [
            {
                law: 'QUESTION-OWNERSHIP',
                kind: 'orphan',
                questionId: 'c-1',
                gridQuestionIds: [],
                path: 'questionsById.c-1',
                detail: 'question is neither top-level nor owned by a grid',
            },
        ])
    })

    it('reports orphaned, top-level-and-column, multi-grid, and dangling column questions', () => {
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionsById: {
                'g-1': { type: 'QuestionGrid', grid: { columnIds: ['c-ordered', 'c-shared', 'c-missing'] } },
                'g-2': { type: 'QuestionGrid', grid: { columnIds: ['c-shared'] } },
                'c-ordered': { type: 'TextShort' },
                'c-shared': { type: 'TextShort' },
                'q-orphan': { type: 'TextShort' },
            },
            questionOrder: ['g-1', 'g-2', 'c-ordered'],
        }

        assert.deepEqual(findQuestionOwnershipViolations(doc), [
            {
                law: 'QUESTION-OWNERSHIP',
                kind: 'dangling-column',
                questionId: 'c-missing',
                gridQuestionIds: ['g-1'],
                path: 'questionsById.g-1.grid.columnIds',
                detail: 'column question is absent from questionsById',
            },
            {
                law: 'QUESTION-OWNERSHIP',
                kind: 'ordered-and-column',
                questionId: 'c-ordered',
                gridQuestionIds: ['g-1'],
                path: 'questionsById.c-ordered',
                detail: 'question is both top-level and owned by a grid',
            },
            {
                law: 'QUESTION-OWNERSHIP',
                kind: 'two-grids',
                questionId: 'c-shared',
                gridQuestionIds: ['g-1', 'g-2'],
                path: 'questionsById.c-shared',
                detail: 'question is owned by more than one grid',
            },
            {
                law: 'QUESTION-OWNERSHIP',
                kind: 'orphan',
                questionId: 'q-orphan',
                gridQuestionIds: [],
                path: 'questionsById.q-orphan',
                detail: 'question is neither top-level nor owned by a grid',
            },
        ])
        assert.equal(
            findTemplateDocumentContractViolations(doc).filter((violation) => violation.law === 'QUESTION-OWNERSHIP')
                .length,
            4,
        )
    })
})

describe('schema lint (DOC-LAW-1 / DOC-LAW-2, by construction)', () => {
    it('finds no violations in the template document schema', () => {
        assert.deepEqual(findTemplateSchemaDocLawViolations(), [])
    })

    it('finds no violations in the answer document schema with its null exception', () => {
        assert.deepEqual(findAnswerSchemaDocLawViolations(), [])
    })

    it('flags an array of objects in a synthetic schema', () => {
        const bad = type({ items: type({ label: 'string' }).array() })
        const violations = findSchemaDocLawViolations(bad.toJsonSchema() as never)
        assert.ok(violations.some((v) => v.law === 'DOC-LAW-1'))
    })

    it('flags a null union in a synthetic schema', () => {
        const bad = type({ field: 'string | null' })
        const violations = findSchemaDocLawViolations(bad.toJsonSchema() as never)
        assert.ok(violations.some((v) => v.law === 'DOC-LAW-2' && v.path.endsWith('field')))
    })

    it('honours the answer-document null exception at answer-value leaves', () => {
        const violations = findAnswerSchemaDocLawViolations()
        assert.equal(violations.length, 0)
        // and the strict template lint has no allow-list at all
        assert.equal(findTemplateSchemaDocLawViolations().length, 0)
    })
})

describe('binding-target uniqueness', () => {
    it('finds two bindings sharing a target', () => {
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: ['q-1'],
            mappingBindingsById: {
                'b-1': { nodeId: 'n-1', fieldId: 'Navn', target: { kind: 'question', questionId: 'q-1' } },
                'b-2': { nodeId: 'n-1', fieldId: 'Adresse', target: { kind: 'question', questionId: 'q-1' } },
            },
        }
        const duplicates = findDuplicateBindingTargets(doc)
        assert.equal(duplicates.length, 1)
        assert.deepEqual(duplicates[0]?.bindingIds, ['b-1', 'b-2'])
    })

    it('treats gridColumn targets as distinct from question targets', () => {
        const doc: QnrTemplateDocument = {
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: ['g-1', 'c-1'],
            mappingBindingsById: {
                'b-1': { nodeId: 'n-1', fieldId: 'Navn', target: { kind: 'question', questionId: 'c-1' } },
                'b-2': {
                    nodeId: 'n-1',
                    fieldId: 'Navn',
                    target: { kind: 'gridColumn', gridQuestionId: 'g-1', columnQuestionId: 'c-1' },
                },
            },
        }
        assert.equal(findDuplicateBindingTargets(doc).length, 0)
    })
})

describe('prefill and highlight contract (M-067 / M-068)', () => {
    const withRules = (): QnrTemplateDocument => ({
        documentId: 'tpl-1',
        revision: 0,
        questionOrder: ['q-1', 'q-2'],
        questionsById: { 'q-1': { type: 'TextShort' }, 'q-2': { type: 'RadioButtons' } },
        prefillRulesById: { 'pr-1': { sourceQuestionId: 'q-2', sourceParentQuestionId: 'g-1' } },
        prefillRuleOrderByQuestionId: { 'q-1': ['pr-1'] },
        highlightRulesById: {
            'hr-1': {
                condition: { sourceQuestionId: 'q-2', operator: 'eq', alternativeIds: ['a-1', 'a-2'] },
                state: 3,
                highlight: true,
                showLink: true,
            },
        },
        highlightRuleOrderByQuestionId: { 'q-1': ['hr-1'] },
        highlightRuleSettingsByQuestionId: { 'q-1': { enabled: true, requiredAll: true } },
    })

    it('accepts the widened rule shapes and the two new collections', () => {
        const result = validateTemplateDocument(withRules())
        assert.ok(result.ok)
    })

    it('refuses a prefill rule with no source address', () => {
        const doc = withRules()
        doc.prefillRulesById = { 'pr-1': {} as never }
        assert.equal(validateTemplateDocument(doc).ok, false)
    })

    it('refuses a false in the true-only settings, so absent stays the only "not set"', () => {
        const doc = withRules()
        doc.highlightRuleSettingsByQuestionId = { 'q-1': { enabled: false as never } }
        assert.equal(validateTemplateDocument(doc).ok, false)
    })

    it('keeps the new shapes inside the document laws', () => {
        // The schema lint is total over the shape, so this proves alternativeIds is a PRIMITIVE
        // array — an array of objects here would be a DOC-LAW-1 violation the lint reports.
        assert.deepEqual(findTemplateSchemaDocLawViolations(), [])
        assert.deepEqual(findDocLawViolations(withRules()), [])
    })

    it('survives a reduction round trip unchanged', () => {
        const doc = withRules()
        const once = reduceToMinimalForm(doc, { isDefault: templateDocumentIsDefault })
        assert.equal(canonicalJson(once), canonicalJson(reduceToMinimalForm(once, { isDefault: templateDocumentIsDefault })))
        assert.equal(canonicalJson(once), canonicalJson(doc))
    })
})

describe('DOC-LAW-2 default registry', () => {
    it('treats sentinel-boolean defaults as omittable', () => {
        assert.equal(templateDocumentIsDefault('questionsById.q-1.required', false), true)
        assert.equal(templateDocumentIsDefault('questionsById.q-1.required', true), false)
        assert.equal(templateDocumentIsDefault('meta.settings.journal.requires_activity_id', false), true)
        assert.equal(templateDocumentIsDefault('meta.instancePolicy.invitationRequired', false), true)
        assert.equal(templateDocumentIsDefault('questionsById.g-1.grid.singleRow', false), true)
    })

    it('never strips a scalar that merely equals false on a non-default path', () => {
        assert.equal(templateDocumentIsDefault('alternativesById.a-1.value', false), false)
        assert.equal(templateDocumentIsDefault('mappingFiltersById.f-1.value', false), false)
        assert.equal(templateDocumentIsDefault('questionsById.q-1.required', 'no'), false)
    })

    it('hashes a spelled-out default identically to its absence', () => {
        const plain = reduceToMinimalForm({ questionsById: { 'q-1': { type: 'TextShort' } } }, {
            isDefault: templateDocumentIsDefault,
        })
        const spelledOut = reduceToMinimalForm(
            { questionsById: { 'q-1': { type: 'TextShort', required: false } } },
            { isDefault: templateDocumentIsDefault },
        )
        assert.equal(canonicalJson(plain), canonicalJson(spelledOut))
    })

    it('reports present-and-default keys on a stored document', () => {
        const violations = findDocLawDefaultViolations({
            documentId: 'tpl-1',
            revision: 0,
            questionOrder: [],
            questionsById: { 'q-1': { type: 'TextShort', required: false } },
        })
        assert.equal(violations.length, 1)
        assert.equal(violations[0]?.path, 'questionsById.q-1.required')
    })
})

describe('op schemas', () => {
    it('validates a representative op and rejects an unknown one', () => {
        assert.equal(templateOpSchema({ type: 'question.create', questionId: 'q-1', questionType: 'TextShort' }) instanceof type.errors, false)
        assert.equal(templateOpSchema({ type: 'question.teleport', questionId: 'q-1' }) instanceof type.errors, true)
        assert.equal(templateOpSchema({ type: 'question.create', questionId: 'q-1', questionType: 'NotAType' }) instanceof type.errors, true)
    })

    it('accepts the explicit-unset tri-state in op payloads', () => {
        const unset = templateOpSchema({ type: 'question.updateField', questionId: 'q-1', field: 'scale.from', value: null })
        assert.equal(unset instanceof type.errors, false)
        const moved = templateOpSchema({ type: 'gridRow.move', questionId: 'g-1', rowId: 'r-1', afterRowId: null })
        assert.equal(moved instanceof type.errors, false)
    })

    it('accepts narrative rules and makes a qnr rule version reference unrepresentable', () => {
        const narrative = templateOpSchema({
            type: 'narrativeRule.set',
            ruleId: 'nr-1',
            questionId: 'q-1',
            condition: { sourceQuestionId: 'q-2' },
        })
        const family = templateOpSchema({
            type: 'qnrRule.set',
            ruleId: 'qr-1',
            questionId: 'q-1',
            condition: { sourceQuestionId: 'q-1' },
            templateFamilyId: 'family-1',
        })
        const pinnedVersion = templateOpSchema({
            type: 'qnrRule.set',
            ruleId: 'qr-1',
            questionId: 'q-1',
            condition: { sourceQuestionId: 'q-1' },
            templateFamilyId: 'family-1',
            templateVersion: 3,
        })

        assert.equal(narrative instanceof type.errors, false)
        assert.equal(family instanceof type.errors, false)
        assert.equal(pinnedVersion instanceof type.errors, true)
    })

    it('validates answer ops including the answer-side move', () => {
        assert.equal(answerOpSchema({ type: 'gridRow.move', questionId: 'g-1', rowId: 'r-1', afterRowId: 'r-2' }) instanceof type.errors, false)
        assert.equal(answerOpSchema({ type: 'gridRow.move', questionId: 'g-1', rowId: 'r-1' }) instanceof type.errors, true)
        assert.equal(answerOpSchema({ type: 'answer.set', questionId: 'q-1', value: null }) instanceof type.errors, false)
    })
})

describe('schema ↔ vocabulary parity', () => {
    it('the template op schema covers exactly IMPLEMENTED_OP_TYPES', () => {
        assert.deepEqual([...SCHEMA_TEMPLATE_OP_TYPES].sort(), [...IMPLEMENTED_OP_TYPES].sort())
    })

    it('the answer op schema covers exactly IMPLEMENTED_ANSWER_OP_TYPES', () => {
        assert.deepEqual([...SCHEMA_ANSWER_OP_TYPES].sort(), [...IMPLEMENTED_ANSWER_OP_TYPES].sort())
    })

    it('the answer document schema accepts a fresh answer document', () => {
        const out = qnrAnswerDocumentSchema({ documentId: 'qnr-1', revision: 0 })
        assert.equal(out instanceof type.errors, false)
    })
})


/**
 * The binding behaviours at the two validation layers (TASK-304 AC-6).
 *
 * The document schema and the op schema disagree on `null` **on purpose** — the op layer is the only
 * place the absent-vs-cleared tri-state exists — so both halves are asserted rather than assumed.
 */
describe('mappingBinding behaviour schemas', () => {
    const createOp = (options: Record<string, unknown>) => ({
        type: 'mappingBinding.create',
        bindingId: 'b-1',
        nodeId: 'n-1',
        fieldId: 'Navn',
        target: { kind: 'question', questionId: 'q-1' },
        ...options,
    })

    const documentWith = (binding: Record<string, unknown>): QnrTemplateDocument =>
        ({
            ...emptyTemplateDocument('tpl-1'),
            questionsById: { 'q-1': { type: 'TextShort' } },
            questionOrder: ['q-1'],
            mappingNodesById: { 'n-1': { entityId: 'Actor' } },
            mappingBindingsById: { 'b-1': binding },
        }) as unknown as QnrTemplateDocument

    it('accepts every declared behaviour value on the create op', () => {
        for (const cardinality of ['0..1', '1', '0..*', '1..*']) {
            assert.equal(templateOpSchema(createOp({ cardinality })) instanceof type.errors, false, cardinality)
        }
        for (const onMissing of ['omit', 'error']) {
            assert.equal(templateOpSchema(createOp({ onMissing })) instanceof type.errors, false, onMissing)
        }
        for (const onMany of ['error', 'first']) {
            assert.equal(templateOpSchema(createOp({ onMany })) instanceof type.errors, false, onMany)
        }
    })

    it('refuses a behaviour value outside the closed set', () => {
        // The whole reason these are not `string?`: this op compiles into an immutable artifact.
        assert.ok(templateOpSchema(createOp({ cardinality: '0..2' })) instanceof type.errors)
        assert.ok(templateOpSchema(createOp({ onMissing: 'ignore' })) instanceof type.errors)
        assert.ok(templateOpSchema(createOp({ onMany: 'last' })) instanceof type.errors)
    })

    it('refuses a behaviour value outside the closed set on a STORED binding too', () => {
        // The op schema guards the wire; this one guards the document. Both are needed: an import or a
        // replay writes a document without passing an op through, and a loose document position would
        // let a value the compiler cannot branch on reach an immutable artifact.
        for (const option of [{ cardinality: '0..2' }, { onMissing: 'ignore' }, { onMany: 'last' }]) {
            const result = validateTemplateDocument(
                documentWith({
                    nodeId: 'n-1',
                    fieldId: 'Navn',
                    target: { kind: 'question', questionId: 'q-1' },
                    ...option,
                }),
            )

            assert.equal(result.ok, false, `${JSON.stringify(option)} must not validate`)
        }
    })

    it('admits null in an update patch and refuses it in the document', () => {
        const patched = templateOpSchema({
            type: 'mappingBinding.update',
            bindingId: 'b-1',
            patch: { cardinality: null, onMissing: null, onMany: null },
        })
        assert.equal(patched instanceof type.errors, false)

        assert.ok(
            validateTemplateDocument(documentWith({
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
                onMany: null,
            })).ok === false,
        )
    })

    it('counts a stored behaviour at its default as a DOC-LAW-2 violation', () => {
        const violations = findDocLawDefaultViolations(
            documentWith({
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
                cardinality: '0..1',
            }),
        )

        assert.deepEqual(
            violations.map((violation) => violation.path),
            ['mappingBindingsById.b-1.cardinality'],
        )
    })

    it('never reads a mapping NODE cardinality as an omittable default', () => {
        // A node's default cardinality is the catalog relation's, not a literal — so a node that
        // narrows a `0..*` relation to a single row stores `0..1` meaningfully. A suffix-matched
        // default rule would drop exactly that member and silently widen the traversal.
        assert.equal(templateDocumentIsDefault('mappingNodesById.n-1.cardinality', '0..1'), false)
        assert.equal(templateDocumentIsDefault('mappingBindingsById.b-1.cardinality', '0..1'), true)

        // And a non-default value on a binding is never omittable either.
        assert.equal(templateDocumentIsDefault('mappingBindingsById.b-1.cardinality', '0..*'), false)
        assert.equal(templateDocumentIsDefault('mappingBindingsById.b-1.onMissing', 'omit'), true)
        assert.equal(templateDocumentIsDefault('mappingBindingsById.b-1.onMany', 'error'), true)
    })
})

// ────────────── OQ-V2-56 · the frozen 0.28.1 canonical-default predicate ──────────────

/**
 * `templateDocumentIsDefaultV0281` exists because "the released predicate" is a moving target.
 *
 * 0.29.0 added the binding-behaviour branch, so a consumer pinned to 0.28.1 hashed a binding carrying
 * `cardinality: '0..1'` with that member PRESENT, while every later release prunes it. Verifying such
 * a snapshot with today's predicate reports corruption that is not there. These cases pin the old
 * rule as an artifact: they describe bytes that were already written, so none of them may be
 * "updated" to match a future canonical form.
 */
describe('the 0.28.1 default predicate is frozen', () => {
    /** Every name 0.28.1 shipped, transcribed from `e885e839` — the complete list, in its order. */
    const V0281_DEFAULT_NAMES = [
        'required',
        'requires_activity_id',
        'ask_for_phone_nr',
        'invitationRequired',
        'singleRow',
        'alwaysNew',
        'timestamps',
    ] as const

    it('recognises exactly the seven 0.28.1 names, and only at `false`', () => {
        for (const name of V0281_DEFAULT_NAMES) {
            assert.equal(templateDocumentIsDefaultV0281(`someObject.${name}`, false), true, name)
            // 0.28.1 keyed on the VALUE too: `true` is content, not an omittable default.
            assert.equal(templateDocumentIsDefaultV0281(`someObject.${name}`, true), false, name)
            // And on a non-boolean, which is a malformed value rather than a default.
            assert.equal(templateDocumentIsDefaultV0281(`someObject.${name}`, 'false'), false, name)
        }
    })

    it('reproduces 0.28.1\u2019s suffix matching, warts included', () => {
        // The leading dot is required, so a ROOT key named `required` was never a default…
        assert.equal(templateDocumentIsDefaultV0281('required', false), false)
        // …while a coincidentally-named unknown member WAS matched. That is a flaw the later
        // exact-path registry avoids, and preserving it here is the point: the bytes were hashed
        // under this rule, so softening it now would change what 0.28.1 meant.
        assert.equal(templateDocumentIsDefaultV0281('someUnknownBag.required', false), true)
        assert.equal(templateDocumentIsDefaultV0281('a.b.c.timestamps', false), true)
        // A partial suffix is not a match.
        assert.equal(templateDocumentIsDefaultV0281('x.notrequired', false), false)
        assert.equal(templateDocumentIsDefaultV0281('x.required_extra', false), false)
    })

    it('does NOT treat the three binding behaviours as defaults', () => {
        // The whole delta, in four lines. 0.28.1 had no branch for these, so a binding spelling out
        // its own default kept that member — and that is what the consumer's stored hashes cover.
        for (const [key, value] of [
            ['cardinality', '0..1'],
            ['onMissing', 'omit'],
            ['onMany', 'error'],
        ] as const) {
            const path = `mappingBindingsById.b-1.${key}`
            assert.equal(templateDocumentIsDefaultV0281(path, value), false, path)
            assert.equal(templateDocumentIsDefault(path, value), true, `${path} must still be pruned by the live predicate`)
        }
    })

    /**
     * The frozen list must not be the live list under another name.
     *
     * Today they happen to hold the same seven entries, so an implementation that simply reused
     * `TEMPLATE_DOCUMENT_DEFAULT_PATHS` would pass every case above — and would then silently
     * redefine "0.28.1" the first time the live list grows. This case is what makes that
     * implementation fail: it names members the live registry may legitimately gain and asserts the
     * frozen predicate stays blind to them.
     */
    it('stays blind to names 0.28.1 did not ship, however the live list evolves', () => {
        for (const name of [
            'deletableRows',
            'editable',
            'auto_import',
            'refresh_button',
            'requires_phone_number',
            'invitation_required',
        ]) {
            assert.equal(templateDocumentIsDefaultV0281(`someObject.${name}`, false), false, name)
        }
    })

    it('agrees with the live predicate everywhere EXCEPT the binding behaviours', () => {
        // A differential oracle rather than a restatement of the implementation: if the frozen copy
        // had dropped, renamed or gained a name, some probe outside the binding paths would disagree.
        const probes: Array<[string, unknown]> = []
        for (const name of [...V0281_DEFAULT_NAMES, 'deletableRows', 'editable', 'cardinality', 'onMany']) {
            for (const value of [false, true, '0..1', 'omit', 'error', 0, null, undefined]) {
                probes.push([`questionsById.q-1.${name}`, value])
                probes.push([`mappingNodesById.n-1.${name}`, value])
                probes.push([`meta.settings.journal.${name}`, value])
            }
        }

        const disagreements = probes.filter(
            ([path, value]) => templateDocumentIsDefaultV0281(path, value) !== templateDocumentIsDefault(path, value),
        )
        assert.deepEqual(disagreements, [], 'the two predicates must differ ONLY on mappingBindingsById paths')

        // …and on those paths they must genuinely differ, or the oracle above proves nothing.
        assert.notEqual(
            templateDocumentIsDefaultV0281('mappingBindingsById.b-1.cardinality', '0..1'),
            templateDocumentIsDefault('mappingBindingsById.b-1.cardinality', '0..1'),
        )
    })
})

describe('a 0.28.1-era snapshot verifies only under the 0.28.1 predicate', () => {
    /** A binding spelling out all three behaviours — the shape the two canonical forms disagree on. */
    const V0281_ERA_DOCUMENT: QnrTemplateDocument = {
        documentId: 'tpl-v0281',
        revision: 4,
        questionOrder: ['q-1'],
        questionsById: { 'q-1': { type: 'TextShort', required: false } },
        mappingNodesById: { 'n-1': { entityId: 'Actor', cardinality: '0..1' } },
        mappingBindingsById: {
            'b-1': {
                nodeId: 'n-1',
                fieldId: 'Navn',
                target: { kind: 'question', questionId: 'q-1' },
                cardinality: '0..1',
                onMissing: 'omit',
                onMany: 'error',
            },
        },
    }

    it('keeps the binding behaviours and prunes the sentinel flag', async () => {
        const reduced = reduceToMinimalForm(V0281_ERA_DOCUMENT, { isDefault: templateDocumentIsDefaultV0281 })
        assert.equal(
            canonicalJson(reduced),
            '{"documentId":"tpl-v0281","mappingBindingsById":{"b-1":{"cardinality":"0..1","fieldId":"Navn",' +
                '"nodeId":"n-1","onMany":"error","onMissing":"omit","target":{"kind":"question","questionId":"q-1"}}},' +
                '"mappingNodesById":{"n-1":{"cardinality":"0..1","entityId":"Actor"}},"questionOrder":["q-1"],' +
                '"questionsById":{"q-1":{"type":"TextShort"}},"revision":4}',
        )
        assert.equal(
            await hashCanonical(reduced),
            'sha256:38f3d38e0b0350b46d1f077f5368f2496cb93bed65572586d627490cb6d0ad30',
        )
    })

    it('hashes differently under the live and authoring predicates, which is the gap', async () => {
        const live = reduceToMinimalForm(V0281_ERA_DOCUMENT, { isDefault: templateDocumentIsDefault })
        const authoring = reduceToMinimalForm(V0281_ERA_DOCUMENT, { isDefault: templateAuthoringIsDefault })

        const liveHash = 'sha256:c7a82f82efbc2994c75069704245a99c087a726115fcf0a4aa0f19fe1e75b26d'
        assert.equal(await hashCanonical(live), liveHash)
        // The authoring predicate is a superset of the live one and adds nothing on this shape, so a
        // NEW write of the same content agrees with the live form — only 0.28.1 stands apart.
        assert.equal(await hashCanonical(authoring), liveHash)

        assert.notEqual(
            await hashCanonical(reduceToMinimalForm(V0281_ERA_DOCUMENT, { isDefault: templateDocumentIsDefaultV0281 })),
            liveHash,
        )
    })

    it('leaves a node-level behaviour alone under every predicate', () => {
        // The live predicate anchors on `mappingBindingsById.<id>.<key>`, so a NODE carrying a
        // deliberately-narrowed `cardinality` survives all three. Pinned because a suffix rule here
        // would drop the one member that made the node take a single row.
        for (const isDefault of [templateDocumentIsDefaultV0281, templateDocumentIsDefault, templateAuthoringIsDefault]) {
            const reduced = reduceToMinimalForm(V0281_ERA_DOCUMENT, { isDefault }) as QnrTemplateDocument
            assert.equal(reduced.mappingNodesById?.['n-1']?.['cardinality'], '0..1')
        }
    })
})
