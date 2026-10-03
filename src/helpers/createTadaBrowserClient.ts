/**
 * createTadaBrowserClient — shared urql client factory for ASMA frontend apps.
 *
 * Wraps the urql core (fetchExchange + optional service-specific exchanges) with
 * an authExchange that attaches a JWT Bearer token and refreshes on 401.
 *
 * URL resolution stays in the app (imports EnvConfigs from asma-helpers);
 * this factory accepts the resolved URL so it has zero dependency on asma-helpers.
 *
 * @see asma-modules/_docs/frontend/operations/2026-07-11-23-00-runbook-graphql-schema-generation-secrets.md
 */
import {
    type Client,
    type ClientOptions,
    createClient,
    type Exchange,
    fetchExchange,
    CombinedError,
    makeOperation,
    type Operation,
    type OperationResult,
} from '@urql/core'
import { authExchange } from '@urql/exchange-auth'
import { filter, makeSubject, map, merge, pipe, share, tap } from 'wonka'
import { SharedContextError } from '../context/createSharedContext.js'
import type { SharedContextBinding, SharedContextLease, SharedContextReadySnapshot } from '../context/context.types.js'

/**
 * Contributes service-specific exchanges (e.g. the Adopus per-tenant namespace
 * rewrite) without baking that knowledge into the generic factory. Called once
 * per client build with the resolved endpoint; returned exchanges are inserted
 * just before `fetchExchange` (and after `authExchange`).
 */
export type ResolveExchanges = (ctx: {
    /** The fully-resolved GraphQL endpoint URL. */
    url: string
    /** Resolves the current JWT (may be stale — the auth exchange handles refresh). */
    getJwt: () => Promise<string | undefined>
}) => Exchange[] | Promise<Exchange[]>

export interface CreateTadaBrowserClientOptions {
    /** Fully-resolved GraphQL endpoint URL (caller resolves via EnvConfigs / srv_urls). */
    url: string
    /** Resolves the current JWT. Typically `getCachedJwt` from asma-core-react. */
    getJwt: () => Promise<string | undefined>
    /** Returns the synchronously cached JWT. Typically `getJwtToken` from auth bindings. */
    getJwtToken: () => string | undefined
    /** Returns true when the cached JWT is still valid. Typically `isJwtValid` from asma-core-react. */
    isJwtValid: () => boolean
    /** Optional service-specific exchanges injected before fetchExchange. */
    resolveExchanges?: ResolveExchanges
    /** Passthrough to urql ClientOptions (url is overridden by the `url` param above). */
    clientOptions?: Partial<ClientOptions>
}

export type ResolveContextExchanges = (ctx: { url: string; snapshot: SharedContextReadySnapshot }) => Exchange[] | Promise<Exchange[]>

/** The host's owner-qualified closure owns credentials; this path never reads auth globals. */
export interface CreateContextTadaBrowserClientOptions {
    contextBinding: SharedContextBinding
    owner: string
    resolveExchanges?: ResolveContextExchanges
    clientOptions?: Partial<ClientOptions>
}

function revokedResult(operation: Operation): OperationResult {
    return { operation, data: undefined, error: new CombinedError({ networkError: new SharedContextError('stale_context') }), stale: false, hasNext: false }
}

/** Guard cached/stream results too, and tear down every active operation on revocation. */
function contextExchange(lease: SharedContextLease): Exchange {
    return ({ forward }) => operations => {
        const active = new Map<number, Operation>()
        const teardown = makeSubject<Operation>()
        const revoked = makeSubject<OperationResult>()
        lease.onRevoke(() => {
            for (const operation of [...active.values()]) {
                revoked.next(revokedResult(operation))
                teardown.next(makeOperation('teardown', operation, operation.context))
            }
            active.clear()
        })
        const incoming = pipe(operations, share)
        const current = pipe(incoming, filter(operation => operation.kind === 'teardown' || lease.isCurrent()), tap(operation => {
            if (operation.kind === 'teardown') active.delete(operation.key)
            else active.set(operation.key, operation)
        }))
        const denied = pipe(incoming, filter(operation => operation.kind !== 'teardown' && !lease.isCurrent()), map(revokedResult))
        const results = pipe(merge([current, teardown.source]), forward, map(result => lease.isCurrent() ? result : revokedResult(result.operation)))
        return merge([results, denied, revoked.source])
    }
}

/**
 * Creates a configured, authenticated urql Client for an ASMA frontend app.
 *
 * Exchange order (first = outermost):
 *   1. authExchange       — attach Bearer token, refresh on 401
 *   2. resolveExchanges   — optional service-specific transforms (e.g. namespace)
 *   3. fetchExchange      — standard HTTP fetch
 *   4. caller-provided    — appended via clientOptions.exchanges (end of pipeline)
 */
export function createTadaBrowserClient(options: CreateTadaBrowserClientOptions): { getClient: () => Promise<Client>; createClient: (opts?: { clientOptions?: Partial<ClientOptions>; anonymous?: boolean }) => Promise<Client> }
export function createTadaBrowserClient(options: CreateContextTadaBrowserClientOptions): { getClient: () => Promise<Client>; createClient: (opts?: { clientOptions?: Partial<ClientOptions>; anonymous?: boolean }) => Promise<Client> }
export function createTadaBrowserClient(options: CreateTadaBrowserClientOptions | CreateContextTadaBrowserClientOptions): { getClient: () => Promise<Client>; createClient: (opts?: { clientOptions?: Partial<ClientOptions>; anonymous?: boolean }) => Promise<Client> } {
    if ('contextBinding' in options) return createContextClient(options)
    const { url, getJwt, getJwtToken, isJwtValid, resolveExchanges, clientOptions } = options
    let tadaClient: Client | undefined

    const getClient = async () => {
        if (!tadaClient) {
            tadaClient = await buildClient({ clientOptions })
        }
        return tadaClient
    }

    async function buildClient(opts?: {
        clientOptions?: Partial<ClientOptions>
        anonymous?: boolean
    }) {
        const _clientOptions: Partial<ClientOptions> = { ...(opts?.clientOptions ?? {}) }
        const anonymous = opts?.anonymous

        _clientOptions.url = url
        _clientOptions.preferGetMethod = false
        // Honor a caller-provided requestPolicy (e.g. devextreme's 'network-only'); default otherwise.
        _clientOptions.requestPolicy = _clientOptions.requestPolicy ?? 'cache-and-network'

        // Start with fetchExchange + caller-provided exchanges
        _clientOptions.exchanges = [
            fetchExchange,
            ...(_clientOptions.exchanges || []),
        ]

        // Inject service-specific exchanges before fetchExchange
        if (resolveExchanges) {
            const extra = await resolveExchanges({
                getJwt,
                url,
            })
            if (extra.length) {
                _clientOptions.exchanges.unshift(...extra)
            }
        }

        // authExchange is outermost (first to receive the operation)
        if (!anonymous) {
            _clientOptions.exchanges.unshift(
                authExchange(async (utils) => {
                    let token = await getJwt()

                    return {
                        addAuthToOperation(operation) {
                            if (!token) {
                                return operation
                            }

                            return utils.appendHeaders(operation, {
                                Authorization: `Bearer ${token}`,
                            })
                        },
                        didAuthError(error) {
                            return error.response.status === 401
                        },
                        async refreshAuth() {
                            token = await getJwt()
                        },
                        willAuthError() {
                            const tokenChanged = token !== getJwtToken()
                            const tokenInvalid = !isJwtValid()
                            return tokenChanged || tokenInvalid
                        },
                    }
                }),
            )
        }

        return createClient(_clientOptions as ClientOptions)
    }

    return { getClient, createClient: buildClient }
}

function createContextClient(options: CreateContextTadaBrowserClientOptions) {
    let cached: { generation: number; promise: Promise<Client> } | undefined
    async function buildClient(opts?: { clientOptions?: Partial<ClientOptions>; anonymous?: boolean }) {
        if (opts?.anonymous) throw new SharedContextError('context_unavailable')
        const owner = await options.contextBinding.createOwnerClient(options.owner)
        owner.lease.assertCurrent()
        const extra = await owner.lease.run(() => options.resolveExchanges?.({ url: owner.url, snapshot: owner.lease.snapshot }) ?? [])
        const clientOptions = opts?.clientOptions ?? options.clientOptions ?? {}
        const client = createClient({
            ...clientOptions,
            url: owner.url,
            fetch: owner.fetch,
            preferGetMethod: false,
            requestPolicy: clientOptions.requestPolicy ?? 'cache-and-network',
            exchanges: [contextExchange(owner.lease), ...extra, fetchExchange, ...(clientOptions.exchanges ?? [])],
        })
        owner.lease.assertCurrent()
        return client
    }
    async function getClient() {
        const snapshot = options.contextBinding.getSnapshot()
        if (snapshot.status !== 'ready') throw new SharedContextError('context_unavailable')
        if (!cached || cached.generation !== snapshot.generation) {
            const entry = { generation: snapshot.generation, promise: buildClient() }
            cached = entry
            entry.promise.catch(() => { if (cached === entry) cached = undefined })
        }
        const client = await cached.promise
        const current = options.contextBinding.getSnapshot()
        if (current.status !== 'ready' || current.generation !== snapshot.generation) throw new SharedContextError('stale_context')
        return client
    }
    return { getClient, createClient: buildClient }
}
