import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { setImmediate as idle } from 'node:timers/promises'
import { gql, type Exchange, type Operation, type OperationResult } from '@urql/core'
import { filter, makeSubject, map, merge, pipe, tap } from 'wonka'
import { createSharedContext, SharedContextError } from '../context/createSharedContext.js'
import type { SharedContextController, SharedContextOwnerClientSource, ValidatedSharedContext } from '../context/context.types.js'
import { createTadaBrowserClient } from './createTadaBrowserClient.js'

const query = gql`query FixtureContext { value }`
const url = 'https://owner.invalid/v1/graphql'
const customer = '00000000-0000-0000-0000-000000000001'
function validated(actor = 'actor'): ValidatedSharedContext {
    return { revision: 1, actor: { user_id: actor, user_role: 'therapist' }, organization: { customer_id: customer }, journal: null,
        selectedRecord: { user_id: 'record', customer_id: customer, relationship: 'participant', journal: null }, exp: Date.now() / 1000 + 60 }
}
function ready(context: SharedContextController, actor = 'actor') { assert.equal(context.invalidate().publish(validated(actor)), true) }
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}
const stale = (error: unknown) => error instanceof SharedContextError && error.code === 'stale_context'
function denied(result: OperationResult) {
    assert.equal(result.data, undefined)
    assert.match(result.error?.message ?? '', /stale_context/)
}

test('bound clients use owner capabilities, dedup creation within a generation and rebuild across actor/record changes', async t => {
    let factories = 0
    let calls = 0
    const context = createSharedContext({ createOwnerClient: (_owner, lease) => {
        ++factories
        return { url, fetch: async () => { ++calls; return Response.json({ data: { value: lease.snapshot.actor.user_id } }) } }
    } })
    t.after(() => context.dispose())
    ready(context)
    const binding = context.mount()
    const factory = createTadaBrowserClient({ contextBinding: binding, owner: 'fixture-owner' })
    const [first, same] = await Promise.all([factory.getClient(), factory.getClient()])
    assert.equal(first, same)
    assert.equal(factories, 1)
    assert.equal((await first.query(query, {}).toPromise()).data?.value, 'actor')
    ready(context, 'replacement')
    denied(await first.query(query, {}).toPromise())
    const replacement = await factory.getClient()
    assert.notEqual(first, replacement)
    assert.equal((await replacement.query(query, {}).toPromise()).data?.value, 'replacement')
    assert.equal(factories, 2)
    assert.equal(calls, 2)
    await assert.rejects(factory.createClient({ anonymous: true }), /context_unavailable/)
    context.invalidate('anonymous')
    await assert.rejects(factory.getClient(), /context_unavailable/)
})

test('async owner factory completion after a newer generation cannot install a stale cached client', async t => {
    const pending = deferred<SharedContextOwnerClientSource>()
    let factories = 0
    const context = createSharedContext({ createOwnerClient: () => ++factories === 1 ? pending.promise : { url, fetch: async () => Response.json({ data: { value: 'new' } }) } })
    t.after(() => context.dispose())
    ready(context)
    const factory = createTadaBrowserClient({ contextBinding: context.mount(), owner: 'fixture-owner' })
    const creating = factory.getClient()
    const rejected = assert.rejects(creating, stale)
    ready(context, 'new')
    const current = await factory.getClient()
    pending.resolve({ url, fetch: async () => Response.json({ data: { value: 'old' } }) })
    await rejected
    assert.equal(await factory.getClient(), current)
    assert.equal((await current.query(query, {}).toPromise()).data?.value, 'new')
})

test('async exchange setup must recheck mount liveness before returning or caching a client', async t => {
    const pending = deferred<Exchange[]>()
    const context = createSharedContext({ createOwnerClient: () => ({ url, fetch: async () => Response.json({ data: {} }) }) })
    t.after(() => context.dispose())
    ready(context)
    const mount = context.mount()
    const factory = createTadaBrowserClient({ contextBinding: mount, owner: 'fixture-owner', resolveExchanges: () => pending.promise })
    const creating = factory.getClient()
    const rejected = assert.rejects(creating, stale)
    await idle()
    mount.dispose()
    pending.resolve([])
    await rejected
    await assert.rejects(factory.getClient(), /context_unavailable/)
})

test('revocation settles an active query without protected data even when the fetch ignores abort', async t => {
    const pending = deferred<Response>()
    const context = createSharedContext({ createOwnerClient: () => ({ url, fetch: async () => pending.promise }) })
    t.after(() => context.dispose())
    ready(context)
    const mount = context.mount()
    const client = await createTadaBrowserClient({ contextBinding: mount, owner: 'fixture-owner' }).getClient()
    const requesting = client.query(query, {}).toPromise()
    await idle()
    mount.dispose()
    denied(await requesting)
    pending.resolve(Response.json({ data: { value: 'retired-private-data' } }))
    await idle()
    denied(await client.query(query, {}).toPromise())
})

test('outer guard sanitizes cached and streamed results, forwards teardown and denies old-client reconnect', async t => {
    const stream = makeSubject<OperationResult>()
    const operations: Operation[] = []
    const exchange: Exchange = () => incoming => merge([
        stream.source,
        pipe(incoming, tap(operation => operations.push(operation)), filter(() => false), map(operation => ({ operation, data: undefined, stale: false, hasNext: false }))),
    ])
    const context = createSharedContext({ createOwnerClient: () => ({ url, fetch: async () => { throw new Error('Cache exchange should own this fixture') } }) })
    t.after(() => context.dispose())
    ready(context)
    const mount = context.mount()
    const client = await createTadaBrowserClient({ contextBinding: mount, owner: 'fixture-owner', resolveExchanges: () => [exchange] }).getClient()
    const results: OperationResult[] = []
    const subscription = client.query(query, {}).subscribe(result => results.push(result))
    t.after(() => subscription.unsubscribe())
    const operation = operations.find(item => item.kind === 'query')!
    assert.ok(operation)
    stream.next({ operation, data: { value: 'current-cache' }, stale: false, hasNext: true })
    assert.equal(results.at(-1)?.data?.value, 'current-cache')
    mount.dispose()
    denied(results.at(-1)!)
    assert.equal(operations.some(item => item.kind === 'teardown'), true)
    stream.next({ operation, data: { value: 'late-stream' }, stale: false, hasNext: false })
    denied(results.at(-1)!)
    ready(context, 'reconnected')
    denied(await client.query(query, {}).toPromise())
    assert.equal(results.some(result => result.data?.value === 'late-stream'), false)
})

test('disposing one instance cannot revoke another mounted owner client', async t => {
    const context = createSharedContext({ createOwnerClient: () => ({ url, fetch: async () => Response.json({ data: { value: 'current' } }) }) })
    t.after(() => context.dispose())
    ready(context)
    const first = context.mount()
    const second = context.mount()
    const firstClient = await createTadaBrowserClient({ contextBinding: first, owner: 'fixture-owner' }).getClient()
    const secondClient = await createTadaBrowserClient({ contextBinding: second, owner: 'fixture-owner' }).getClient()
    first.dispose()
    denied(await firstClient.query(query, {}).toPromise())
    assert.equal((await secondClient.query(query, {}).toPromise()).data?.value, 'current')
})

test('legacy API retains auth headers, exchange callbacks, client caching and anonymous option', async t => {
    let calls = 0
    const seen: (string | null)[] = []
    let exchangeCalls = 0
    const factory = createTadaBrowserClient({ url, getJwt: async () => 'legacy-fixture-token', getJwtToken: () => 'legacy-fixture-token', isJwtValid: () => true,
        resolveExchanges: async ctx => { ++exchangeCalls; assert.equal(ctx.url, url); assert.equal(await ctx.getJwt(), 'legacy-fixture-token'); return [] },
        clientOptions: { fetch: async (input, init) => {
            ++calls
            seen.push(new Request(input, init).headers.get('authorization'))
            return Response.json({ data: { value: 'legacy' } })
        } } })
    const first = await factory.getClient()
    assert.equal(await factory.getClient(), first)
    assert.equal((await first.query(query, {}).toPromise()).data?.value, 'legacy')
    const anonymous = await factory.createClient({ anonymous: true, clientOptions: { fetch: async () => { ++calls; return Response.json({ data: { value: 'anonymous' } }) } } })
    assert.equal((await anonymous.query(query, {}).toPromise()).data?.value, 'anonymous')
    assert.deepEqual(seen, ['Bearer legacy-fixture-token'])
    assert.equal(calls, 2)
    assert.equal(exchangeCalls, 2)
})

// initTada imports legacy browser modules, so supply the same minimal import-time host.
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Reflect.set(globalThis, 'window', { location: new URL('https://test.adopus.no'), get __ASMA__SHELL__() { throw new Error('Bound init must not read global auth') },
    get __GENERATE_ENV_CONFIGS_BINDINGS__() { throw new Error('Bound init must not resolve a global endpoint') } })
Reflect.set(globalThis, 'localStorage', { getItem: () => null })
const { initTadaBrowserClient } = await import('./initTadaBrowserClient.js')
after(() => {
    if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
})
test('bound init returns before any global auth or environment fallback', async t => {
    const context = createSharedContext({ createOwnerClient: () => ({ url, fetch: async () => Response.json({ data: { value: 'owned' } }) }) })
    t.after(() => context.dispose())
    ready(context)
    const client = await initTadaBrowserClient({ contextBinding: context.mount(), owner: 'fixture-owner' }).getClient()
    assert.equal((await client.query(query, {}).toPromise()).data?.value, 'owned')
    context.invalidate('denied')
    await assert.rejects(initTadaBrowserClient({ contextBinding: context.mount(), owner: 'fixture-owner' }).getClient(), /context_unavailable/)
})
