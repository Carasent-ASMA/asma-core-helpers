/**
 * adopusNamespaceExchange — urql exchange that maps unprefixed gql.tada operations onto the
 * consolidated Adopus Hasura engine's per-tenant namespace, at the wire level only.
 *
 * Compile-time types stay the unprefixed avansas/AdOpusTest schema (DEC-004/DEC-011); this
 * exchange rewrites the parsed document + JSON per request/response:
 *   1. request:  wrap each operation's selection set in the `<slug>` root field
 *   2. request:  prefix schema type names in variable definitions (`Actor_bool_exp` -> `<slug>_Actor_bool_exp`)
 *   3. request:  prefix fragment type conditions (inline + named)
 *   4. response: unwrap `data[<slug>]` -> `data`
 *   5. response: strip the `<slug>_` prefix from `__typename` values
 *
 * `prefixedTypes` is the exact set of names the engine prefixes for the tenant source —
 * generated at codegen time by adopus-hsr-wrapper/scripts/unwrap_client_schema.mjs
 * (adopus-prefixed-types.json) so the runtime never guesses which names carry the prefix.
 *
 * Install it only on the SRV_AO_WRAPPER client and only when the resolved endpoint is the
 * consolidated engine (`/api/hsr-wrapper/`) — the per-tenant `srv_urls.ao_wrapper` flip then
 * switches endpoint and namespace mode atomically.
 *
 * @see asma-modules/_docs/adopus-graphql/plans/2026-07-11-00-14-plan-adopus-hasura2-consolidation.md:184 — §2.4.3 (DEC-004/DEC-015)
 */
import type { DocumentNode } from '@0no-co/graphql.web'
import { makeOperation, type Exchange, type Operation, type OperationResult } from '@urql/core'
import { map, pipe } from 'wonka'

// Minimal structural AST model for exactly the nodes the transforms touch — graphql.web's
// published types carry `kind: any`, which defeats discriminant narrowing; these mirror the
// spec shape and the public API still speaks graphql.web's DocumentNode.
interface NameNode {
    kind: 'Name'
    value: string
}
interface NamedTypeNode {
    kind: 'NamedType'
    name: NameNode
}
type AstTypeNode = NamedTypeNode | { kind: 'ListType' | 'NonNullType'; type: AstTypeNode }
interface AstFieldNode {
    kind: 'Field'
    name: NameNode
    selectionSet?: AstSelectionSetNode
}
interface AstInlineFragmentNode {
    kind: 'InlineFragment'
    typeCondition?: NamedTypeNode
    selectionSet: AstSelectionSetNode
}
type AstSelectionNode = AstFieldNode | AstInlineFragmentNode | { kind: 'FragmentSpread'; name: NameNode }
interface AstSelectionSetNode {
    kind: 'SelectionSet'
    selections: readonly AstSelectionNode[]
}
interface AstVariableDefinitionNode {
    kind: 'VariableDefinition'
    type: AstTypeNode
}
interface AstOperationDefinitionNode {
    kind: 'OperationDefinition'
    variableDefinitions?: readonly AstVariableDefinitionNode[]
    selectionSet: AstSelectionSetNode
}
interface AstFragmentDefinitionNode {
    kind: 'FragmentDefinition'
    typeCondition: NamedTypeNode
    selectionSet: AstSelectionSetNode
}
type AstDefinitionNode = AstOperationDefinitionNode | AstFragmentDefinitionNode | { kind: string }
interface AstDocumentNode {
    kind: 'Document'
    definitions: readonly AstDefinitionNode[]
}

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/

// not parseJwt.js — that module touches `window` at import time; this subpath stays environment-neutral
function decodeJwtClaims(jwt: string): { subdomain?: string } | undefined {
    const payload = jwt.split('.')[1]
    if (!payload) return undefined
    try {
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))))
    } catch {
        return undefined
    }
}

/**
 * Derive the tenant namespace slug from the main ASMA JWT's `subdomain` claim (DEC-015),
 * sanitized per plan §1.1 (lowercase, hyphens -> underscores). Returns undefined when the
 * token is missing or the claim does not sanitize to a valid slug — callers skip the
 * exchange in that case.
 */
export function adopusSlugFromJwt(jwt: string | undefined): string | undefined {
    if (!jwt) return undefined
    const claims = decodeJwtClaims(jwt)
    const slug = claims?.subdomain?.toLowerCase().replace(/-/g, '_')
    if (!slug || !SLUG_PATTERN.test(slug)) {
        console.error(`adopusSlugFromJwt: subdomain claim '${claims?.subdomain}' is not a valid namespace slug`)
        return undefined
    }
    return slug
}

/** Transforms 1–3 on the parsed operation document. Pure; exported for tests. */
export function namespaceDocument(document: DocumentNode, slug: string, prefixed: ReadonlySet<string>): DocumentNode {
    const doc = document as unknown as AstDocumentNode

    const prefixName = (name: NameNode): NameNode =>
        prefixed.has(name.value) ? { ...name, value: `${slug}_${name.value}` } : name

    const prefixType = (type: AstTypeNode): AstTypeNode =>
        type.kind === 'NamedType' ? { ...type, name: prefixName(type.name) } : { ...type, type: prefixType(type.type) }

    const prefixFragmentConditions = (selectionSet: AstSelectionSetNode): AstSelectionSetNode => ({
        ...selectionSet,
        selections: selectionSet.selections.map((sel): AstSelectionNode => {
            if (sel.kind === 'InlineFragment') {
                return {
                    ...sel,
                    typeCondition: sel.typeCondition && { ...sel.typeCondition, name: prefixName(sel.typeCondition.name) },
                    selectionSet: prefixFragmentConditions(sel.selectionSet),
                }
            }
            if (sel.kind === 'Field' && sel.selectionSet) {
                return { ...sel, selectionSet: prefixFragmentConditions(sel.selectionSet) }
            }
            return sel
        }),
    })

    const out: AstDocumentNode = {
        ...doc,
        definitions: doc.definitions.map((def): AstDefinitionNode => {
            if (def.kind === 'OperationDefinition') {
                const op = def as AstOperationDefinitionNode
                const namespaceField: AstFieldNode = {
                    kind: 'Field',
                    name: { kind: 'Name', value: slug },
                    selectionSet: prefixFragmentConditions(op.selectionSet),
                }
                return {
                    ...op,
                    variableDefinitions: op.variableDefinitions?.map((v) => ({ ...v, type: prefixType(v.type) })),
                    selectionSet: { kind: 'SelectionSet', selections: [namespaceField] },
                }
            }
            if (def.kind === 'FragmentDefinition') {
                const frag = def as AstFragmentDefinitionNode
                return {
                    ...frag,
                    typeCondition: { ...frag.typeCondition, name: prefixName(frag.typeCondition.name) },
                    selectionSet: prefixFragmentConditions(frag.selectionSet),
                }
            }
            return def
        }),
    }
    return out as unknown as DocumentNode
}

/** Transforms 4–5 on the response payload. Pure (returns new objects); exported for tests. */
export function denamespaceData<T>(data: T, slug: string): T {
    const unwrapped =
        data && typeof data === 'object' && !Array.isArray(data) && slug in (data as Record<string, unknown>)
            ? (data as Record<string, unknown>)[slug]
            : data
    return stripTypenamePrefix(unwrapped, `${slug}_`) as T
}

function stripTypenamePrefix(value: unknown, prefix: string): unknown {
    if (Array.isArray(value)) return value.map((v) => stripTypenamePrefix(v, prefix))
    if (!value || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
        out[key] = key === '__typename' && typeof v === 'string' && v.startsWith(prefix) ? v.slice(prefix.length) : stripTypenamePrefix(v, prefix)
    }
    return out
}

/**
 * @param slug tenant namespace — derive with `adopusSlugFromJwt(await getCachedJwt())`
 * @param prefixedTypes contents of the codegen-emitted `adopus-prefixed-types.json`
 */
export function adopusNamespaceExchange({
    slug,
    prefixedTypes,
}: {
    slug: string
    prefixedTypes: readonly string[]
}): Exchange {
    const prefixed: ReadonlySet<string> = new Set(prefixedTypes)
    // documents are module-level gql.tada constants — stable references, so WeakMap memoizes
    // the rewrite once per document (NOT per operation.key, which varies with variables)
    const rewritten = new WeakMap<DocumentNode, DocumentNode>()

    const rewriteOperation = (op: Operation): Operation => {
        if (op.kind === 'teardown') return op
        let query = rewritten.get(op.query)
        if (!query) {
            query = namespaceDocument(op.query, slug, prefixed)
            rewritten.set(op.query, query)
        }
        return makeOperation(op.kind, { ...op, query }, op.context)
    }

    const rewriteResult = (result: OperationResult): OperationResult =>
        result.operation.kind === 'teardown' || result.data == null
            ? result // ponytail: error paths keep the <slug> segment — cosmetic, fix if it ever confuses anyone
            : { ...result, data: denamespaceData(result.data, slug) }

    return ({ forward }) =>
        (ops$) =>
            pipe(forward(pipe(ops$, map(rewriteOperation))), map(rewriteResult))
}
