import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { setImmediate as idle } from 'node:timers/promises'
import { createSharedContext, SharedContextError } from '../context/createSharedContext.js'
import type { SharedContextController, ValidatedSharedContext } from '../context/context.types.js'
import type { ICheckSigninOptions } from './generateSrvAuthBindings.types.js'

const customer = '00000000-0000-0000-0000-000000000001'
const authUrl = 'https://auth.invalid'
const ownerUrl = 'https://owner.invalid/v1/graphql'
const browser = {
    location: new URL('https://test.adopus.no'),
    __GENERATE_ENV_CONFIGS_BINDINGS__: { EnvConfigsFnReg: { host: () => ({ SRV_AUTH: authUrl, BUNJS_EDITOR: 'https://editor.invalid', DEVELOPMENT: false }) } },
}
const savedGlobals = new Map(['window', 'localStorage', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
Reflect.set(globalThis, 'window', browser)
Reflect.set(globalThis, 'localStorage', { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 })
const bindings = await import('./generateSrvAuthBindings.js')
let fetchHandler: typeof fetch
Reflect.set(globalThis, 'fetch', (input: RequestInfo | URL, init?: RequestInit) => fetchHandler(input, init))
let auth: ReturnType<typeof bindings.generateSrvAuthBindings<string>>
let logoutObserved: (() => void) | undefined
before(() => { auth = bindings.generateSrvAuthBindings<string>(() => logoutObserved?.()) })
beforeEach(async () => {
    logoutObserved = undefined
    fetchHandler = async () => Response.json({ message: 'Success' })
    auth.dispatchLogoutEvent()
    await idle()
    fetchHandler = async () => { throw new Error('Unexpected fixture fetch') }
})
after(() => {
    fetchHandler = async () => Response.json({ message: 'Success' })
    auth.dispatchLogoutEvent()
    for (const [key, descriptor] of savedGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
    }
})
function metadata(overrides: Partial<ICheckSigninOptions<string>> = {}): ICheckSigninOptions<string> {
    return { user_id: 'actor', user_role: 'therapist', customer_id: customer, journal: 'ADOPUS', journal_user_id: 'staff',
        srv_urls: { ao_wrapper: ownerUrl, connector: ownerUrl, onlyoffice: ownerUrl }, exp: Date.now() / 1000 + 60,
        features: ['allowed'], theme: 'host-theme', ...overrides }
}
function validated(): ValidatedSharedContext {
    return { revision: 1, actor: { user_id: 'actor', user_role: 'therapist' }, organization: { customer_id: customer },
        journal: null, selectedRecord: null, exp: Date.now() / 1000 + 60 }
}
function publish(context: SharedContextController) { assert.equal(context.invalidate().publish(validated()), true) }
async function login(overrides: Partial<ICheckSigninOptions<string>> = {}, token = 'fixture-token') {
    fetchHandler = async () => Response.json({ message: 'Success', token, metadata: metadata(overrides) })
    return auth.srvAuthGet(new URL('/login', authUrl))
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
    return { promise, resolve, reject }
}
const stale = (error: unknown) => error instanceof SharedContextError && error.code === 'stale_context'

test('legacy producer is reused; login invalidates but cannot authorize or publish a selected record', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    assert.equal(bindings.generateSrvAuthBindings(undefined, { sharedContext: context }), auth)
    publish(context)
    const lease = context.mount().capture()
    await login()
    assert.equal(lease.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'pending')
    assert.equal(context.getSnapshot().actor, null)
    assert.equal(auth.getJwtToken(), 'fixture-token')
    assert.equal(auth.getMetadata()?.features.has('allowed'), true)
    assert.equal((await auth.signin('/already-signed-in')).token, 'fixture-token')
})

test('failed signout clears credentials, metadata, context and caches before logout observers', async t => {
    t.mock.method(console, 'warn', () => {})
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    const lease = context.mount().capture()
    logoutObserved = () => {
        assert.equal(auth.getJwtToken(), '')
        assert.equal(auth.getMetadata(), undefined)
        assert.equal(lease.isCurrent(), false)
    }
    fetchHandler = async () => { throw new Error('Failed fixture signout') }
    auth.dispatchLogoutEvent('UNTRUSTED')
    assert.equal(context.getSnapshot().status, 'anonymous')
    await idle()
    assert.equal(auth.getParsedJwt(), undefined)
    assert.equal(auth.getConnector(), undefined)
    assert.equal(auth.hasFeature('allowed'), false)
})

test('late signout success carrying metadata cannot overwrite a newer login', async t => {
    const pending = deferred<Response>()
    await login()
    fetchHandler = async () => pending.promise
    auth.dispatchLogoutEvent()
    await login({ user_id: 'new-actor' }, 'new-token')
    pending.resolve(Response.json({ token: 'retired-token', metadata: metadata({ user_id: 'retired' }) }))
    t.mock.method(console, 'warn', () => {})
    await idle()
    assert.equal(auth.getJwtToken(), 'new-token')
    assert.equal(auth.getUserId(), 'new-actor')
})

test('GET dedup includes full query and headers; ceremonies are never coalesced', async () => {
    const pending = deferred<Response>()
    let calls = 0
    fetchHandler = async () => { ++calls; return (await pending.promise).clone() }
    const first = auth.srvAuthGet(new URL('/check?member=a', authUrl), { 'x-fixture': 'one' })
    const same = auth.srvAuthGet(new URL('/check?member=a', authUrl), { 'x-fixture': 'one' })
    const otherQuery = auth.srvAuthGet(new URL('/check?member=b', authUrl), { 'x-fixture': 'one' })
    const otherHeader = auth.srvAuthGet(new URL('/check?member=a', authUrl), { 'x-fixture': 'two' })
    const post1 = auth.srvAuthPost(new URL('/ceremony', authUrl), { value: 1 })
    const post2 = auth.srvAuthPost(new URL('/ceremony', authUrl), { value: 1 })
    assert.equal(calls, 5)
    pending.resolve(Response.json({ value: 'read' }))
    const results = await Promise.all([first, same, otherQuery, otherHeader, post1, post2])
    assert.deepEqual(results, Array(6).fill({ value: 'read' }))
})

test('record change retires pending auth lookup; an old response cannot install credentials', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    const pending = deferred<Response>()
    fetchHandler = async () => pending.promise
    const lookup = auth.srvAuthGet(new URL('/check?record=old', authUrl))
    const rejected = assert.rejects(lookup, stale)
    publish(context)
    pending.resolve(Response.json({ token: 'old-token', metadata: metadata() }))
    await rejected
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(auth.getJwtToken(), '')
})

test('late token refresh failure cannot sign out the replacement actor/customer/role', async () => {
    const pending = deferred<Response>()
    fetchHandler = async () => pending.promise
    const refreshing = auth.getNewJwtToken()
    const rejected = assert.rejects(refreshing, stale)
    await login({ user_id: 'replacement', customer_id: '00000000-0000-0000-0000-000000000002', user_role: 'recipient' }, 'replacement-token')
    pending.reject(new Error('Retired fixture request failed'))
    await rejected
    assert.equal(auth.getJwtToken(), 'replacement-token')
    assert.equal(auth.getMetadata()?.user_role, 'recipient')
})

test('expiry clears every cached identity/grant read even when the timer is delayed', async t => {
    t.mock.method(console, 'warn', () => {})
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    const started = Date.now()
    await login({ exp: started / 1000 + 11 })
    publish(context)
    const lease = context.mount().capture()
    // accessTokenHasExpired uses the Date constructor, matching legacy epoch rounding.
    t.mock.timers.enable({ apis: ['Date'], now: started + 12_000 })
    assert.equal(auth.getFeatures(), undefined)
    assert.equal(auth.getTheme(), undefined)
    assert.equal(auth.getSrvUrls(), undefined)
    assert.equal(auth.getUserId(), undefined)
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(lease.signal.aborted, true)
})

test('activity cache and pending dedup are generation scoped; old completion cannot refill after deselection', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    const pending = deferred<Response>()
    let calls = 0
    fetchHandler = async () => { ++calls; return pending.promise }
    const first = auth.getActivityStatuses(['7'])
    const same = auth.getActivityStatuses(['7'])
    const rejected1 = assert.rejects(first, stale)
    const rejected2 = assert.rejects(same, stale)
    await idle()
    assert.equal(calls, 1)
    publish(context)
    pending.resolve(Response.json([{ soknadID: 7, adgangkode: 2 }]))
    await Promise.all([rejected1, rejected2])
    fetchHandler = async () => { ++calls; return Response.json([{ soknadID: 7, adgangkode: 1 }]) }
    assert.equal((await auth.getActivityStatuses(['7'])).get('7'), 'READ')
    assert.equal((await auth.getActivityStatuses(['7'])).get('7'), 'READ')
    assert.equal(calls, 2)
    const aborted = new AbortController()
    aborted.abort()
    await assert.rejects(auth.getActivityStatuses(['7'], aborted.signal), stale)
    context.invalidate('anonymous')
    await auth.getActivityStatuses(['7'])
    assert.equal(calls, 3)
})

test('explicit activity invalidation rejects an abort-ignoring pending request and permits a new lookup', async () => {
    await login()
    const pending = deferred<Response>()
    fetchHandler = async () => pending.promise
    const request = auth.getActivityStatuses(['8'])
    const rejected = assert.rejects(request, stale)
    await idle()
    auth.invalidateActivityStatuses(['8'])
    pending.resolve(Response.json([{ soknadID: 8, adgangkode: 2 }]))
    await rejected
    fetchHandler = async () => Response.json([{ soknadID: 8, adgangkode: 1 }])
    assert.equal((await auth.getActivityStatuses(['8'])).get('8'), 'READ')
})

test('owner capability never exposes credentials and denies late JWT resolution after unmount', async t => {
    const pending = deferred<string>()
    let calls = 0
    const context = createSharedContext({ createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient({
        getCachedJwt: () => pending.promise, isJwtValid: () => true, getNewJwtToken: async () => 'refreshed',
    }, ownerUrl, lease) })
    t.after(() => context.dispose())
    publish(context)
    const binding = context.mount()
    const owner = await binding.createOwnerClient('fixture-owner')
    assert.deepEqual(Object.keys(owner).sort(), ['fetch', 'lease', 'url'])
    fetchHandler = async () => { ++calls; return Response.json({ data: 'private' }) }
    const request = owner.fetch(ownerUrl)
    const rejected = assert.rejects(request, stale)
    binding.dispose()
    pending.resolve('retired-token')
    await rejected
    assert.equal(calls, 0)
})

test('owner 401 refresh rechecks generation and mount liveness; stale refresh cannot retry', async t => {
    const refreshing = deferred<string>()
    let calls = 0
    const context = createSharedContext({ createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient({
        getCachedJwt: async () => 'fixture-token', isJwtValid: () => true, getNewJwtToken: () => refreshing.promise,
    }, ownerUrl, lease) })
    t.after(() => context.dispose())
    publish(context)
    const binding = context.mount()
    const owner = await binding.createOwnerClient('fixture-owner')
    fetchHandler = async (input, init) => {
        ++calls
        const request = new Request(input, init)
        assert.equal(request.headers.get('authorization'), 'Bearer fixture-token')
        assert.equal(request.redirect, 'error')
        return new Response(null, { status: 401 })
    }
    const request = owner.fetch(ownerUrl)
    const rejected = assert.rejects(request, stale)
    await idle()
    assert.equal(calls, 1)
    binding.dispose()
    refreshing.resolve('retired-refresh')
    await rejected
    assert.equal(calls, 1)
    await assert.rejects(owner.fetch('https://foreign.invalid/v1/graphql'), stale)
})

test('owner adapter preserves a current-generation 401 retry and rejects foreign endpoints', async t => {
    let token = 'old-fixture-token'
    let calls = 0
    const context = createSharedContext({ createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient({
        getCachedJwt: async () => token, isJwtValid: () => true, getNewJwtToken: async () => (token = 'new-fixture-token'),
    }, ownerUrl, lease) })
    t.after(() => context.dispose())
    publish(context)
    const owner = await context.mount().createOwnerClient('fixture-owner')
    fetchHandler = async (input, init) => {
        const request = new Request(input, init)
        assert.equal(request.headers.get('authorization'), `Bearer ${token}`)
        return ++calls === 1 ? new Response(null, { status: 401 }) : Response.json({ data: 'current' })
    }
    assert.equal((await owner.fetch(ownerUrl)).status, 200)
    assert.equal(calls, 2)
    await assert.rejects(owner.fetch('https://foreign.invalid/v1/graphql'), /wrong_owner_endpoint/)
    assert.equal(calls, 2)
})
