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

test('disposed attachment failure cannot poison a later login or replacement', async t => {
    const disposed = createSharedContext()
    disposed.dispose()
    assert.throws(() => bindings.generateSrvAuthBindings(undefined, { sharedContext: disposed }),
        (error: unknown) => error instanceof SharedContextError && error.code === 'disposed')
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    const lease = context.mount().capture()
    await login({ user_id: 'replacement', customer_id: '00000000-0000-0000-0000-000000000002' }, 'replacement-token')
    assert.equal(auth.getJwtToken(), 'replacement-token')
    assert.equal(auth.getUserId(), 'replacement')
    assert.equal(lease.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'pending')
})

test('failed subscription does not retain an otherwise live controller', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    let invalidations = 0
    const unsubscribable: SharedContextController = {
        ...context,
        subscribe() { throw new Error('Fixture subscription failed') },
        invalidate() { ++invalidations; throw new Error('Retained failed attachment') },
    }
    assert.throws(() => bindings.generateSrvAuthBindings(undefined, { sharedContext: unsubscribable }), /Fixture subscription failed/)
    await login()
    assert.equal(auth.getJwtToken(), 'fixture-token')
    assert.equal(invalidations, 0)
})

test('successful attachment unsubscribes on disposal and permits login', async t => {
    const context = createSharedContext()
    let subscriptions = 0
    let removals = 0
    const tracked: SharedContextController = {
        ...context,
        subscribe(listener) {
            ++subscriptions
            const unsubscribe = context.subscribe(listener)
            return () => { ++removals; unsubscribe() }
        },
    }
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: tracked })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: tracked })
    assert.equal(subscriptions, 1)
    context.dispose()
    assert.equal(removals, 1)
    await login()
    assert.equal(auth.getJwtToken(), 'fixture-token')
})

test('live cleanup failure clears credentials and revokes every context before reporting failure', async t => {
    const failing = createSharedContext()
    const healthy = createSharedContext()
    t.after(() => { failing.dispose(); healthy.dispose() })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: failing })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: healthy })
    await login()
    publish(failing)
    publish(healthy)
    const failedLease = failing.mount().capture()
    const healthyLease = healthy.mount().capture()
    failedLease.onRevoke(() => { throw new Error('Fixture cleanup failed') })
    await assert.rejects(login({ user_id: 'replacement' }, 'replacement-token'),
        (error: unknown) => error instanceof SharedContextError && error.code === 'cleanup_failed')
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(failedLease.isCurrent(), false)
    assert.equal(healthyLease.isCurrent(), false)
    assert.equal(failedLease.signal.aborted, true)
    assert.equal(healthyLease.signal.aborted, true)
    assert.equal(failing.getSnapshot().status, 'denied')
    await login({ user_id: 'recovered' }, 'recovered-token')
    assert.equal(auth.getJwtToken(), 'recovered-token')
})

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

// CRB-006 (rework-r4): expiry is not a logout. The token, identity and every shared context
// still retire, but the legacy session metadata stays readable until the refresh outcome, so
// legacy getters (getMetadata, getUserId, hasFeature, getSrvUrls) no longer go blank at expiry.
test('CRB-006: the expiry read path retires the token and contexts but keeps the legacy session metadata', async t => {
    t.mock.method(console, 'warn', () => {})
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    const started = Date.now()
    await login({ exp: started / 1000 + 11 })
    publish(context)
    const lease = context.mount().capture()
    // Revocation callbacks run inside the expiry reset; at expiry they still see the retained
    // session so legacy readers that react to revocation keep their identity context.
    const observedAtRevoke: (string | undefined)[] = []
    lease.onRevoke(() => { observedAtRevoke.push(auth.getMetadata()?.user_id) })
    const read = deferred<Response>()
    fetchHandler = async () => read.promise
    const inFlight = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=expiry-read', authUrl))
    await idle()
    // accessTokenHasExpired uses the Date constructor, matching legacy epoch rounding.
    t.mock.timers.enable({ apis: ['Date'], now: started + 12_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata()?.user_role, 'therapist')
    assert.equal(auth.getUserId(), 'actor')
    assert.equal(auth.hasFeature('allowed'), true)
    assert.equal(auth.getTheme(), 'host-theme')
    assert.deepEqual(auth.getSrvUrls(), metadata().srv_urls)
    assert.equal(auth.getConnector(), 'ADOPUS')
    assert.deepEqual(observedAtRevoke, ['actor'])
    assert.equal(lease.signal.aborted, true)
    assert.equal(context.getSnapshot().status, 'denied')
    read.resolve(Response.json({ value: 'pre-expiry' }))
    const [result] = await Promise.allSettled([inFlight])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    // Reads after the reset still answer from the retained session, and still hold no token.
    assert.equal(auth.getFeatures()?.includes('allowed'), true)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.isJwtValid(), false)
})

test('activity cache and pending dedup are generation scoped; stale completions resolve empty without refill', async t => {
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
    await idle()
    assert.equal(calls, 1)
    publish(context)
    pending.resolve(Response.json([{ soknadID: 7, adgangkode: 2 }]))
    const [staleFirst, staleSame] = await Promise.all([first, same])
    assert.equal(staleFirst.size, 0)
    assert.equal(staleSame.size, 0)
    fetchHandler = async () => { ++calls; return Response.json([{ soknadID: 7, adgangkode: 1 }]) }
    assert.equal((await auth.getActivityStatuses(['7'])).get('7'), 'READ')
    assert.equal((await auth.getActivityStatuses(['7'])).get('7'), 'READ')
    assert.equal(calls, 2)
    const aborted = new AbortController()
    aborted.abort()
    assert.equal((await auth.getActivityStatuses(['7'], aborted.signal)).size, 0)
    context.invalidate('anonymous')
    await auth.getActivityStatuses(['7'])
    assert.equal(calls, 3)
})

test('explicit activity invalidation resolves an abort-ignoring pending request empty and permits a new lookup', async () => {
    await login()
    const pending = deferred<Response>()
    fetchHandler = async () => pending.promise
    const request = auth.getActivityStatuses(['8'])
    await idle()
    auth.invalidateActivityStatuses(['8'])
    pending.resolve(Response.json([{ soknadID: 8, adgangkode: 2 }]))
    assert.equal((await request).size, 0)
    fetchHandler = async () => Response.json([{ soknadID: 8, adgangkode: 1 }])
    assert.equal((await auth.getActivityStatuses(['8'])).get('8'), 'READ')
})

test('CRB-001: cleanup and subscriber failures never skip UNTRUSTED signout or restore state', async t => {
    const failingLease = createSharedContext()
    const failingSubscriber = createSharedContext()
    t.after(() => {
        try { failingLease.dispose() } catch {}
        try { failingSubscriber.dispose() } catch {}
    })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: failingLease })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: failingSubscriber })
    await login()
    publish(failingLease)
    publish(failingSubscriber)
    const lease = failingLease.mount().capture()
    lease.onRevoke(() => { throw Error('Synthetic lease cleanup failure') })
    const subscriberMount = failingSubscriber.mount()
    subscriberMount.subscribe(() => { throw Error('Synthetic subscriber failure') })

    let signoutUrl: string | undefined
    let signoutCalls = 0
    fetchHandler = async (input, init) => {
        const request = new Request(input, init)
        if (new URL(request.url).pathname.endsWith('/signout')) {
            ++signoutCalls
            signoutUrl = request.url
            return Response.json({ message: 'Success', token: 'must-not-restore', metadata: metadata() })
        }
        throw new Error(`Unexpected fixture request: ${request.url}`)
    }
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    t.after(() => process.off('unhandledRejection', onUnhandled))

    auth.dispatchLogoutEvent('UNTRUSTED')
    await idle()

    assert.equal(signoutCalls, 1)
    assert.equal(new URL(signoutUrl!).searchParams.get('unset'), 'device_authorization_token')
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata(), undefined)
    assert.deepEqual(unhandled, [])
})

test('CRB-002: auth expiry read contains cleanup failure and stays denied', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    const lease = context.mount().capture()
    lease.onRevoke(() => { throw Error('Synthetic expiry cleanup failure') })
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 120_000 })

    assert.doesNotThrow(() => auth.getMetadata())
    assert.equal(auth.isJwtValid(), false)
    // CRB-006: the contained cleanup failure still clears the token and denies the context.
    // Only the legacy session metadata survives, so a consumer read cannot throw at expiry.
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    assert.equal(lease.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'denied')
})

test('CRB-002: auth expiry timer contains cleanup failure', async t => {
    const started = Date.now()
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: started })
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login({ exp: started / 1000 + 60 })
    publish(context)
    const lease = context.mount().capture()
    lease.onRevoke(() => { throw Error('Synthetic timer cleanup failure') })

    assert.doesNotThrow(() => t.mock.timers.tick(60_000))
    assert.equal(auth.isJwtValid(), false)
    // CRB-006: the timer reaches the same expiry reset; the contained failure clears the token
    // and denies the context, and only the legacy session metadata survives.
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    assert.equal(lease.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'denied')
})

test('CRB-006: the expiry timer retires the token and contexts but keeps the legacy session metadata', async t => {
    t.mock.method(console, 'warn', () => {})
    const started = Date.now()
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: started })
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login({ exp: started / 1000 + 60 })
    publish(context)
    const lease = context.mount().capture()
    const read = deferred<Response>()
    fetchHandler = async () => read.promise
    const inFlight = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=expiry-timer', authUrl))
    await idle()
    assert.equal(auth.isJwtValid(), true)

    t.mock.timers.tick(60_000)

    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.customer_id, customer)
    assert.equal(auth.getUserId(), 'actor')
    assert.equal(auth.hasFeature('allowed'), true)
    assert.deepEqual(auth.getSrvUrls(), metadata().srv_urls)
    assert.equal(lease.isCurrent(), false)
    assert.equal(lease.signal.aborted, true)
    assert.equal(context.getSnapshot().status, 'denied')
    read.resolve(Response.json({ value: 'pre-expiry' }))
    const [result] = await Promise.allSettled([inFlight])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
})

test('CRB-006: a same-actor refresh after expiry installs the new token and keeps the identity generation', async t => {
    const started = Date.now()
    await login({}, 'tok-before-expiry')
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    const read = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/token')) {
            return Response.json({ message: 'Success', token: 'tok-after-expiry', metadata: metadata({ exp: started / 1000 + 600 }) })
        }
        if (url.includes('/wards')) return read.promise
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=post-expiry', authUrl))
    await idle()
    await auth.getNewJwtToken()
    assert.equal(auth.getJwtToken(), 'tok-after-expiry')
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    assert.equal(auth.isJwtValid(), true)
    // The refresh replaced a token-less session, so it is not an authorization change: a read
    // started under the retained identity is still current.
    read.resolve(Response.json({ value: 'post-expiry-read' }))
    assert.deepEqual(await reading, { value: 'post-expiry-read' })
})

test('CRB-006: a different actor installed after expiry is an authorization change', async t => {
    const started = Date.now()
    await login({}, 'tok-actor')
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getUserId(), 'actor')
    const read = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/switch')) {
            return Response.json({
                message: 'Success',
                token: 'tok-other-actor',
                metadata: metadata({
                    user_id: 'other',
                    customer_id: '00000000-0000-0000-0000-000000000002',
                    journal_user_id: 'other-staff',
                    exp: started / 1000 + 600,
                }),
            })
        }
        if (url.includes('/wards')) return read.promise
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=post-expiry', authUrl))
    await idle()
    await auth.srvAuthGet(new URL('/switch', authUrl))
    assert.equal(auth.getUserId(), 'other')
    assert.equal(auth.getJwtToken(), 'tok-other-actor')
    read.resolve(Response.json({ value: 'post-expiry-read' }))
    const [result] = await Promise.allSettled([reading])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
})

test('CRB-006: the first token after expiry is the start-order boundary, so an older different-actor response cannot replace it', async t => {
    const started = Date.now()
    await login({}, 'tok-first')
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    const older = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'older') return older.promise
        if (url.pathname.endsWith('/token')) {
            return Response.json({ message: 'Success', token: 'tok-refreshed', metadata: metadata({ exp: started / 1000 + 600 }) })
        }
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const olderPromise = auth.srvAuthPost(new URL('/signin?phase=older', authUrl), {})
    await idle()
    await auth.getNewJwtToken()
    assert.equal(auth.getJwtToken(), 'tok-refreshed')
    // No token existed at expiry, so this install is the session's first one and fixes the
    // start-order boundary; an older-started token for another actor must not replace it.
    older.resolve(Response.json({ message: 'Success', token: 'tok-older-actor', metadata: metadata({ user_id: 'actor-b', journal_user_id: 'staff-b' }) }))
    const [result] = await Promise.allSettled([olderPromise])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    assert.equal(auth.getJwtToken(), 'tok-refreshed')
    assert.equal(auth.getUserId(), 'actor')
})

test('CRB-006: a failed refresh after expiry clears the retained metadata before revoking the contexts', async t => {
    t.mock.method(console, 'warn', () => {})
    const started = Date.now()
    const expired = createSharedContext()
    const replacement = createSharedContext()
    t.after(() => {
        try { expired.dispose() } catch {}
        try { replacement.dispose() } catch {}
    })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: expired })
    await login()
    publish(expired)
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    // A context published after expiry is current, so its revocation callback runs inside the
    // failed-refresh reset. Unlike expiry, cleanup must not observe the retired session.
    bindings.generateSrvAuthBindings(undefined, { sharedContext: replacement })
    publish(replacement)
    const lease = replacement.mount().capture()
    const observedAtRevoke: (string | undefined)[] = []
    lease.onRevoke(() => { observedAtRevoke.push(auth.getMetadata()?.user_id) })
    let signouts = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/signout')) {
            ++signouts
            return Response.json({ message: 'Success' })
        }
        throw new Error(`Synthetic refresh failure: ${url}`)
    }

    assert.equal(await auth.getNewJwtToken(), undefined)
    await idle()

    assert.equal(signouts, 1)
    assert.deepEqual(observedAtRevoke, [undefined])
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(auth.getUserId(), undefined)
    assert.equal(auth.isJwtValid(), false)
    assert.equal(replacement.getSnapshot().status, 'anonymous')
})

test('CRB-006: a /token signout response after expiry clears the retained metadata', async t => {
    const started = Date.now()
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    let signouts = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/signout')) {
            ++signouts
            return Response.json({ message: 'Success' })
        }
        return Response.json({ message: 'Success', signout: true })
    }

    assert.equal(await auth.getNewJwtToken(), undefined)
    await idle()

    assert.equal(signouts, 1)
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(auth.isJwtValid(), false)
    assert.equal(context.getSnapshot().status, 'anonymous')
})

test('CRB-006: a logout after expiry clears the retained metadata', async t => {
    const started = Date.now()
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    t.mock.timers.enable({ apis: ['Date'], now: started + 120_000 })
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata()?.user_id, 'actor')
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }

    auth.dispatchLogoutEvent()
    await idle()

    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(auth.getUserId(), undefined)
    assert.equal(auth.isJwtValid(), false)
    assert.equal(context.getSnapshot().status, 'anonymous')
})

test('CRB-005: activity lookup refreshes an expiring token before the editor request', async t => {
    const started = Date.now()
    await login({ exp: started / 1000 + 5 })
    let tokenCalls = 0
    let activityCalls = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/token')) {
            ++tokenCalls
            return Response.json({ message: 'Success', token: 'refreshed-token', metadata: metadata({ exp: started / 1000 + 600 }) })
        }
        if (url.includes('ReadOnlyAccessCheck')) {
            ++activityCalls
            return Response.json([{ soknadID: 7, adgangkode: 1 }])
        }
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const map = await auth.getActivityStatuses(['7'])
    assert.equal(map.get('7'), 'READ')
    assert.equal(tokenCalls, 1)
    assert.equal(activityCalls, 1)
})

test('CRB-005: an in-flight activity lookup resolves empty across a same-session token refresh', async () => {
    await login()
    const editor = deferred<Response>()
    let tokenCalls = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('ReadOnlyAccessCheck')) return editor.promise
        if (url.includes('/token')) {
            ++tokenCalls
            return Response.json({ message: 'Success', token: 'refreshed-token', metadata: metadata() })
        }
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const lookup = auth.getActivityStatuses(['7'])
    await idle()
    await auth.srvAuthGet(new URL('/token', authUrl))
    editor.resolve(Response.json([{ soknadID: 7, adgangkode: 2 }]))
    assert.equal((await lookup).size, 0)
    assert.equal(tokenCalls, 1)
})

test('CRB-005: unrelated activity invalidation resolves an in-flight lookup empty', async () => {
    await login()
    const editor = deferred<Response>()
    fetchHandler = async input => String(input).includes('ReadOnlyAccessCheck')
        ? editor.promise
        : Response.json({ message: 'Success', token: 'refreshed-token', metadata: metadata() })
    const lookup = auth.getActivityStatuses(['7'])
    await idle()
    auth.invalidateActivityStatuses(['99'])
    editor.resolve(Response.json([{ soknadID: 7, adgangkode: 2 }]))
    assert.equal((await lookup).size, 0)
})

test('CRB-005: a concurrent logout resolves the in-flight lookup empty without a fresh refresh', async () => {
    await login()
    const editor = deferred<Response>()
    let tokenCalls = 0
    let signouts = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/signout')) {
            ++signouts
            return Response.json({ message: 'Success' })
        }
        if (url.includes('ReadOnlyAccessCheck')) return editor.promise
        if (url.includes('/token')) {
            ++tokenCalls
            return Response.json({ message: 'Success', token: 'fresh-token', metadata: metadata() })
        }
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const lookup = auth.getActivityStatuses(['7'])
    await idle()
    auth.dispatchLogoutEvent()
    editor.resolve(Response.json([{ soknadID: 7, adgangkode: 2 }]))
    assert.equal((await lookup).size, 0)
    assert.equal(signouts, 1)
    assert.equal(tokenCalls, 0)
})

test('CRA-8342-001: reentrant logout during context cleanup cancels the replacement and a fresh login still works', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)
    const lease = context.mount().capture()
    let signouts = 0
    fetchHandler = async (input, init) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/signout')) {
            ++signouts
            return Response.json({ message: 'Success' })
        }
        if (request.url.endsWith('/replace')) {
            return Response.json({ message: 'Success', token: 'replacement-token', metadata: metadata({ user_id: 'replacement' }) })
        }
        throw new Error(`Unexpected fixture request: ${request.url}`)
    }
    lease.onRevoke(() => auth.dispatchLogoutEvent())

    let refusal: unknown
    try {
        await auth.srvAuthGet('/replace')
    } catch (error) {
        refusal = error
    }
    await idle()
    assert.equal((refusal as { code?: string } | undefined)?.code, 'stale_context')
    assert.equal(signouts, 1)
    assert.equal(auth.isJwtValid(), false)
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(context.getSnapshot().status, 'anonymous')

    await login({ user_id: 'fresh' }, 'fresh-token')
    assert.equal(auth.isJwtValid(), true)
    assert.equal(auth.getMetadata()?.user_id, 'fresh')
})

test('CRB-004: metadata-only subdomain response first does not retire the concurrent token response', async () => {
    const token = deferred<Response>()
    const check = deferred<Response>()
    const anonMeta = { customer_id: customer, journal: 'ADOPUS', srv_urls: metadata().srv_urls }
    fetchHandler = async input => String(input).includes('/token') ? token.promise : check.promise
    const tokenPromise = auth.getCachedJwt()
    const checkPromise = auth.checkForRegisteredSubdomain()
    await idle()
    check.resolve(Response.json({ message: 'Success', metadata: anonMeta }))
    await idle()
    token.resolve(Response.json({ message: 'Success', token: 'real-session-token', metadata: metadata() }))
    const [tokenResult, checkResult] = await Promise.allSettled([tokenPromise, checkPromise])
    assert.equal(tokenResult.status, 'fulfilled')
    assert.equal(checkResult.status, 'fulfilled')
    assert.equal(auth.getJwtToken(), 'real-session-token')
    assert.equal(auth.getUserId(), 'actor')
})

test('CRB-004: token-bearing subdomain check first keeps the concurrent token response current', async () => {
    const token = deferred<Response>()
    const check = deferred<Response>()
    fetchHandler = async input => String(input).includes('/token') ? token.promise : check.promise
    const tokenPromise = auth.getCachedJwt()
    const checkPromise = auth.checkForRegisteredSubdomain()
    await idle()
    check.resolve(Response.json({ message: 'Success', token: 'check-token', metadata: metadata() }))
    await idle()
    token.resolve(Response.json({ message: 'Success', token: 'real-session-token', metadata: metadata() }))
    const [tokenResult, checkResult] = await Promise.allSettled([tokenPromise, checkPromise])
    assert.equal(tokenResult.status, 'fulfilled')
    assert.equal(checkResult.status, 'fulfilled')
    assert.equal(auth.getJwtToken(), 'real-session-token')
})

test('CRB-004: token first rejects a later metadata-only subdomain response from overwriting it', async () => {
    const token = deferred<Response>()
    const check = deferred<Response>()
    fetchHandler = async input => String(input).includes('/token') ? token.promise : check.promise
    const tokenPromise = auth.getCachedJwt()
    const checkPromise = auth.checkForRegisteredSubdomain()
    await idle()
    token.resolve(Response.json({ message: 'Success', token: 'real-session-token', metadata: metadata() }))
    await idle()
    check.resolve(Response.json({ message: 'Success', metadata: { customer_id: customer, journal: 'ADOPUS', srv_urls: {} } }))
    const [tokenResult, checkResult] = await Promise.allSettled([tokenPromise, checkPromise])
    assert.equal(tokenResult.status, 'fulfilled')
    assert.equal(checkResult.status, 'fulfilled')
    assert.equal(auth.getJwtToken(), 'real-session-token')
    assert.equal(auth.getUserId(), 'actor')
    assert.deepEqual(auth.getSrvUrls(), metadata().srv_urls)
})

test('CRB-004: logout retires both in-flight responses and a fresh login works', async () => {
    const token = deferred<Response>()
    const check = deferred<Response>()
    let signouts = 0
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/signout')) {
            ++signouts
            return Response.json({ message: 'Success' })
        }
        if (url.includes('/token')) return token.promise
        return check.promise
    }
    const tokenPromise = auth.getCachedJwt()
    const checkPromise = auth.checkForRegisteredSubdomain()
    await idle()
    auth.dispatchLogoutEvent()
    token.resolve(Response.json({ message: 'Success', token: 'retired-token', metadata: metadata() }))
    check.resolve(Response.json({ message: 'Success', metadata: metadata() }))
    const [tokenResult, checkResult] = await Promise.allSettled([tokenPromise, checkPromise])
    assert.equal(tokenResult.status, 'rejected')
    assert.equal(checkResult.status, 'rejected')
    assert.equal(signouts, 1)
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getUserId(), undefined)
    await login({ user_id: 'fresh' }, 'fresh-token')
    assert.equal(auth.getJwtToken(), 'fresh-token')
    assert.equal(auth.getUserId(), 'fresh')
})

test('CRB-004: same-actor grant change retires an older in-flight auth read', async () => {
    await login()
    const old = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/login2')) return Response.json({ message: 'Success', token: 'new-token', metadata: metadata({ features: ['changed'] }) })
        return old.promise
    }
    const oldPromise = auth.srvAuthGet(new URL('/check?ctx=old', authUrl))
    await idle()
    await auth.srvAuthGet(new URL('/login2', authUrl))
    old.resolve(Response.json({ message: 'Success', token: 'old-token', metadata: metadata() }))
    const oldResult = await Promise.allSettled([oldPromise])
    assert.equal(oldResult[0]!.status, 'rejected')
    assert.equal(auth.getJwtToken(), 'new-token')
    assert.equal(auth.getMetadata()?.features.has('changed'), true)
})

test('CRB-004: a different user/organization token response retires an older auth read', async () => {
    await login()
    const old = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/switch')) {
            return Response.json({
                message: 'Success',
                token: 'other-org-token',
                metadata: metadata({ user_id: 'other', customer_id: '00000000-0000-0000-0000-000000000002' }),
            })
        }
        return old.promise
    }
    const oldPromise = auth.srvAuthGet(new URL('/check?ctx=old', authUrl))
    await idle()
    await auth.srvAuthGet(new URL('/switch', authUrl))
    old.resolve(Response.json({ message: 'Success', token: 'old-token', metadata: metadata() }))
    const oldResult = await Promise.allSettled([oldPromise])
    assert.equal(oldResult[0]!.status, 'rejected')
    assert.equal(auth.getJwtToken(), 'other-org-token')
    assert.equal(auth.getUserId(), 'other')
})

test('COORD-8342-002: a late initial response for a different actor cannot replace the installed actor', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    fetchHandler = async input => String(input).includes('attempt=a') ? a.promise : b.promise
    const pa = auth.srvAuthPost(new URL('/signin?attempt=a', authUrl), { fixture: 'a' })
    const pb = auth.srvAuthPost(new URL('/signin?attempt=b', authUrl), { fixture: 'b' })
    await idle()
    b.resolve(Response.json({ message: 'Success', token: 'fixture-token-b', metadata: metadata({ user_id: 'actor-b', journal_user_id: 'staff-b' }) }))
    assert.equal((await Promise.allSettled([pb]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), 'actor-b')
    a.resolve(Response.json({ message: 'Success', token: 'fixture-token-a', metadata: metadata({ user_id: 'actor-a', journal_user_id: 'staff-a' }) }))
    const [aResult] = await Promise.allSettled([pa])
    assert.equal(aResult!.status, 'rejected')
    assert.equal(stale((aResult as PromiseRejectedResult).reason), true)
    assert.equal(auth.getUserId(), 'actor-b')
    assert.equal(auth.getJwtToken(), 'fixture-token-b')
})

test('COORD-8342-002: an ambiguous late token without actor metadata fails closed', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    fetchHandler = async input => String(input).includes('attempt=a') ? a.promise : b.promise
    const pa = auth.srvAuthPost(new URL('/signin?attempt=a', authUrl), { fixture: 'a' })
    const pb = auth.srvAuthPost(new URL('/signin?attempt=b', authUrl), { fixture: 'b' })
    await idle()
    b.resolve(Response.json({ message: 'Success', token: 'fixture-token-b', metadata: metadata({ user_id: 'actor-b', journal_user_id: 'staff-b' }) }))
    assert.equal((await Promise.allSettled([pb]))[0]!.status, 'fulfilled')
    a.resolve(Response.json({ message: 'Success', token: 'fixture-token-a' }))
    const [aResult] = await Promise.allSettled([pa])
    assert.equal(aResult!.status, 'rejected')
    assert.equal(stale((aResult as PromiseRejectedResult).reason), true)
    assert.equal(auth.getUserId(), 'actor-b')
    assert.equal(auth.getJwtToken(), 'fixture-token-b')
})

test('COORD-8342-002: a different guardian of the same ward cannot replace the installed guardian', async () => {
    const guardian = (id: string) => ({
        user_id: 'ward',
        journal_user_id: 'ward-journal',
        user_role: 'recipient' as const,
        legal_guardian: { journal_user_id: id, full_name: 'Synthetic guardian', phone_nr: null, pnr: 'synthetic-fixture' },
    })
    await login(guardian('guardian-1'), 'fixture-token-g1')
    const old = deferred<Response>()
    fetchHandler = async input => String(input).includes('phase=old')
        ? old.promise
        : Response.json({ message: 'Success', token: 'fixture-token-g2', metadata: metadata(guardian('guardian-2')) })
    const pa = auth.srvAuthPost(new URL('/signin?phase=old', authUrl), { fixture: 'old' })
    await idle()
    await auth.srvAuthPost(new URL('/signin?phase=new', authUrl), { fixture: 'new' })
    assert.equal(auth.getMetadata()?.legal_guardian?.journal_user_id, 'guardian-2')
    old.resolve(Response.json({ message: 'Success', token: 'fixture-token-g1-late', metadata: metadata(guardian('guardian-1')) }))
    const [oldResult] = await Promise.allSettled([pa])
    assert.equal(oldResult!.status, 'rejected')
    assert.equal(stale((oldResult as PromiseRejectedResult).reason), true)
    assert.equal(auth.getMetadata()?.legal_guardian?.journal_user_id, 'guardian-2')
    assert.equal(auth.getJwtToken(), 'fixture-token-g2')
})

test('COORD-8342-002: the older initial response installs and the newer actor replaces it', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    fetchHandler = async input => String(input).includes('attempt=a') ? a.promise : b.promise
    const pa = auth.srvAuthPost(new URL('/signin?attempt=a', authUrl), { fixture: 'a' })
    const pb = auth.srvAuthPost(new URL('/signin?attempt=b', authUrl), { fixture: 'b' })
    await idle()
    a.resolve(Response.json({ message: 'Success', token: 'fixture-token-a', metadata: metadata({ user_id: 'actor-a', journal_user_id: 'staff-a' }) }))
    assert.equal((await Promise.allSettled([pa]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), 'actor-a')
    b.resolve(Response.json({ message: 'Success', token: 'fixture-token-b', metadata: metadata({ user_id: 'actor-b', journal_user_id: 'staff-b' }) }))
    assert.equal((await Promise.allSettled([pb]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), 'actor-b')
    assert.equal(auth.getJwtToken(), 'fixture-token-b')
})

test('COORD-8342-002: an actor switch started before a same-actor refresh installs when the refresh lands first', async () => {
    await login()
    const switching = deferred<Response>()
    const refreshing = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('phase=switch')) return switching.promise
        if (url.includes('phase=refresh')) return refreshing.promise
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const switchPromise = auth.srvAuthPost(new URL('/signin?phase=switch', authUrl), { fixture: 'switch' })
    await idle()
    const refreshPromise = auth.srvAuthPost(new URL('/signin?phase=refresh', authUrl), { fixture: 'refresh' })
    await idle()
    refreshing.resolve(Response.json({ message: 'Success', token: 'fixture-token-refreshed', metadata: metadata() }))
    assert.equal((await Promise.allSettled([refreshPromise]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), 'actor')
    switching.resolve(Response.json({ message: 'Success', token: 'fixture-token-switch', metadata: metadata({ user_id: 'actor-b' }) }))
    assert.equal((await Promise.allSettled([switchPromise]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), 'actor-b')
    assert.equal(auth.getJwtToken(), 'fixture-token-switch')
})

test('COORD-8342-003 W1 (root witness, rework-r3/root-witness): a pre-logout token response cannot replace a same-actor re-login', async () => {
    const old = deferred<Response>()
    let loginToken = 'tok-first'
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'old') return old.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        return Response.json({ message: 'Success', token: loginToken, metadata: metadata() })
    }
    await auth.srvAuthGet(new URL('/login', authUrl))
    assert.equal(auth.getJwtToken(), 'tok-first')
    const pending = auth.srvAuthGet(new URL('/token?phase=old', authUrl))
    await idle()
    auth.dispatchLogoutEvent()
    await idle()
    assert.equal(auth.getJwtToken(), '')
    loginToken = 'tok-new'
    await auth.srvAuthGet(new URL('/login?again=1', authUrl))
    assert.equal(auth.getJwtToken(), 'tok-new')
    old.resolve(Response.json({ message: 'Success', token: 'tok-pre-logout', metadata: metadata() }))
    const [result] = await Promise.allSettled([pending])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    assert.equal(auth.getJwtToken(), 'tok-new')
})

test('COORD-8342-003 W2 (root witness, rework-r3/root-witness): a non-token read for the previous actor cannot resolve after a switch', async () => {
    const old = deferred<Response>()
    let next = { token: 'tok-a', meta: metadata() }
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'old') return old.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        return Response.json({ message: 'Success', token: next.token, metadata: next.meta })
    }
    await auth.srvAuthGet(new URL('/login', authUrl))
    const pending = auth.srvAuthGet<{ wards: string[] }>(new URL('/wards?phase=old', authUrl))
    await idle()
    next = { token: 'tok-b', meta: metadata({ user_id: 'actor-b', journal_user_id: 'staff-b' }) }
    await auth.srvAuthGet(new URL('/login?switch=b', authUrl))
    assert.equal(auth.getUserId(), 'actor-b')
    old.resolve(Response.json({ wards: ['ward-of-actor-a'] }))
    const [result] = await Promise.allSettled([pending])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    assert.equal(auth.getUserId(), 'actor-b')
})

test('COORD-8342-003 W3 (root witness, rework-r3/root-witness): a pre-logout non-token read cannot resolve after re-login', async () => {
    const old = deferred<Response>()
    let loginToken = 'tok-first'
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'old') return old.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        return Response.json({ message: 'Success', token: loginToken, metadata: metadata() })
    }
    await auth.srvAuthGet(new URL('/login', authUrl))
    const pending = auth.srvAuthGet<{ devices: string[] }>(new URL('/devices?phase=old', authUrl))
    await idle()
    auth.dispatchLogoutEvent()
    await idle()
    loginToken = 'tok-new'
    await auth.srvAuthGet(new URL('/login?again=1', authUrl))
    old.resolve(Response.json({ devices: ['pre-logout-device-list'] }))
    const [result] = await Promise.allSettled([pending])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    assert.equal(auth.getJwtToken(), 'tok-new')
})

test('COORD-8342-003 W4 (root witness, rework-r3/root-witness): stale-epoch public metadata naming a device user is ignored and the session kept', async () => {
    const old = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'old') return old.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        return Response.json({ message: 'Success', token: 'tok-login', metadata: metadata() })
    }
    const check = auth.srvAuthGet(new URL('/check?context=subdomain&phase=old', authUrl))
    await idle()
    await auth.srvAuthGet(new URL('/login', authUrl))
    old.resolve(Response.json({ message: 'Success', metadata: { user_id: 'actor', journal_user_id: 'staff', customer_id: customer, journal: 'ADOPUS',
        srv_urls: { ao_wrapper: ownerUrl, connector: ownerUrl, onlyoffice: ownerUrl }, step2_active_options: { sms: true } } }))
    const [result] = await Promise.allSettled([check])
    assert.equal(result!.status, 'fulfilled')
    assert.equal(auth.getJwtToken(), 'tok-login')
    assert.equal(auth.getMetadata()?.user_role, 'therapist')
})

test('R2B-003: a refresh failure with a throwing lease cleanup still signs out and notifies the host once', async t => {
    t.mock.method(console, 'warn', () => {})
    const context = createSharedContext()
    t.after(() => {
        try { context.dispose() } catch {}
    })
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    let logoutCalls = 0
    logoutObserved = () => { ++logoutCalls }
    await login()
    publish(context)
    const lease = context.mount().capture()
    lease.onRevoke(() => { throw Error('Synthetic refresh cleanup failure') })
    let signoutCalls = 0
    fetchHandler = async input => {
        if (String(input).includes('/signout')) {
            ++signoutCalls
            return Response.json({ message: 'Success' })
        }
        throw new Error('Synthetic refresh network failure')
    }
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    t.after(() => process.off('unhandledRejection', onUnhandled))

    assert.equal(await auth.getNewJwtToken(), undefined)
    await idle()

    assert.equal(signoutCalls, 1)
    assert.equal(logoutCalls, 1)
    assert.deepEqual(unhandled, [])
    assert.equal(auth.getJwtToken(), '')
    assert.equal(auth.getMetadata(), undefined)
    assert.equal(auth.isJwtValid(), false)
    assert.equal(context.getSnapshot().status, 'anonymous')
})

// R3b test-only correction: pin the authorization fingerprint and the two identity windows.
// Field tables adapted from the R3 QA witness QA-R3-S06a/S06b (qa/harness-versions/r3-h1) and the
// CR-B r3b fingerprint witness; identity windows adapted from QA-R3-S08a/S08c/S08d (r3-h2).
const denyListedMetadata: [string, unknown, unknown][] = [
    ['exp', Date.now() / 1000 + 30, Date.now() / 1000 + 90],
    ['iat', 100, 200],
    ['vt', 30, 60],
    ['srv_urls',
        { ao_wrapper: 'https://one.invalid', connector: 'https://one.invalid', onlyoffice: 'https://one.invalid' },
        { ao_wrapper: 'https://two.invalid', connector: 'https://two.invalid', onlyoffice: 'https://two.invalid' }],
    ['theme', 'theme-1', 'theme-2'],
    ['overviews', [], [{ name: 'overview', app_context: 'ADVOCA' as const, overview_widgets: [] }]],
    ['tabbar', { version: 1 as const, destinationIds: null }, { version: 1 as const, destinationIds: [] as const }],
    ['default_app_versions', { app: '1' }, { app: '2' }],
    ['openreplay',
        { enable: false, block: false, live_assist: false, graphql: false, mobx: false, profiler: false, advoca: false },
        { enable: true, block: false, live_assist: false, graphql: false, mobx: false, profiler: false, advoca: false }],
    ['privacy_policy',
        { content_en: null, content_no: null, monitoring_content_en: null, monitoring_content_no: null },
        { content_en: 'changed', content_no: null, monitoring_content_en: null, monitoring_content_no: null }],
    ['advoca_info_link', 'link-1', 'link-2'],
    ['step2_active_options', { sms: false }, { sms: true }],
    ['of_max_connections', 1, 2],
    ['of_connections_per_user', 1, 2],
]
const withMetadataField = (field: string, value: unknown) =>
    metadata({ [field]: value } as Partial<ICheckSigninOptions<string>>)
const retiringMetadata: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['has_wards', {}, { has_wards: true }],
    ['legal_guardian (a change inside the object)',
        { legal_guardian: { journal_user_id: 'guardian', full_name: 'Guardian One', phone_nr: null, pnr: 'synthetic' } },
        { legal_guardian: { journal_user_id: 'guardian', full_name: 'Guardian Two', phone_nr: null, pnr: 'synthetic' } }],
    ['an unknown future claim', {}, { future_claim: 'elevated' }],
    ['an unknown claim named by the CR-B M10 mutant', {}, { brand_new_actor_claim: 'elevated' }],
]

for (const [field, first, second] of denyListedMetadata) {
    test(`R3B-002 / R3-F-02: deny-listed ${field} keeps a same-session read current and an older same-session token installs`, async () => {
        await login({ [field]: first } as Partial<ICheckSigninOptions<string>>, 'tok-field-1')
        const read = deferred<Response>()
        fetchHandler = async input => {
            const url = new URL(String(input))
            if (url.searchParams.get('phase') === 'read') return read.promise
            if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
            if (url.pathname.endsWith('/token')) {
                return Response.json({ message: 'Success', token: 'tok-field-2', metadata: withMetadataField(field, second) })
            }
            throw new Error(`Unexpected fixture request: ${url}`)
        }
        const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=read', authUrl))
        await idle()
        await auth.getNewJwtToken()
        assert.equal(auth.getJwtToken(), 'tok-field-2')
        read.resolve(Response.json({ value: 'pre-refresh' }))
        assert.deepEqual(await reading, { value: 'pre-refresh' })

        const older = deferred<Response>()
        const newer = deferred<Response>()
        fetchHandler = async input => {
            const url = new URL(String(input))
            if (url.searchParams.get('phase') === 'older') return older.promise
            if (url.searchParams.get('phase') === 'newer') return newer.promise
            if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
            throw new Error(`Unexpected fixture request: ${url}`)
        }
        const olderPromise = auth.srvAuthPost(new URL('/signin?phase=older', authUrl), {})
        await idle()
        const newerPromise = auth.srvAuthPost(new URL('/signin?phase=newer', authUrl), {})
        await idle()
        newer.resolve(Response.json({ message: 'Success', token: 'tok-field-newer', metadata: withMetadataField(field, second) }))
        assert.equal((await Promise.allSettled([newerPromise]))[0]!.status, 'fulfilled')
        older.resolve(Response.json({ message: 'Success', token: 'tok-field-older', metadata: withMetadataField(field, first) }))
        const [olderResult] = await Promise.allSettled([olderPromise])
        assert.equal(olderResult!.status, 'fulfilled')
        assert.equal(auth.getJwtToken(), 'tok-field-older')
    })
}

for (const [name, olderMetadata, newerMetadata] of retiringMetadata) {
    test(`R3B-002 / R3-F-02: ${name} retires an older in-flight read and an older-started token`, async () => {
        await login(olderMetadata as Partial<ICheckSigninOptions<string>>, 'tok-retire-base')
        const older = deferred<Response>()
        const read = deferred<Response>()
        fetchHandler = async input => {
            const url = new URL(String(input))
            if (url.searchParams.get('phase') === 'older-token') return older.promise
            if (url.searchParams.get('phase') === 'read') return read.promise
            if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
            if (url.pathname.endsWith('/switch')) {
                return Response.json({ message: 'Success', token: 'tok-retire-new', metadata: metadata(newerMetadata as Partial<ICheckSigninOptions<string>>) })
            }
            throw new Error(`Unexpected fixture request: ${url}`)
        }
        const olderPromise = auth.srvAuthPost(new URL('/signin?phase=older-token', authUrl), {})
        await idle()
        const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=read', authUrl))
        await idle()
        await auth.srvAuthGet(new URL('/switch', authUrl))
        assert.equal(auth.getJwtToken(), 'tok-retire-new')
        older.resolve(Response.json({ message: 'Success', token: 'tok-retire-old', metadata: metadata(olderMetadata as Partial<ICheckSigninOptions<string>>) }))
        read.resolve(Response.json({ value: 'pre-switch' }))
        const [olderResult] = await Promise.allSettled([olderPromise])
        assert.equal(olderResult!.status, 'rejected')
        assert.equal(stale((olderResult as PromiseRejectedResult).reason), true)
        const [readResult] = await Promise.allSettled([reading])
        assert.equal(readResult!.status, 'rejected')
        assert.equal(stale((readResult as PromiseRejectedResult).reason), true)
        assert.equal(auth.getJwtToken(), 'tok-retire-new')
    })
}

test('R3B-002 / R3-F-02: features compare as a sorted set, so a reordered list is the same actor', async () => {
    await login({ features: ['a', 'b'] }, 'tok-features-1')
    const read = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'read') return read.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        if (url.pathname.endsWith('/token')) {
            return Response.json({ message: 'Success', token: 'tok-features-2', metadata: metadata({ features: ['b', 'a'] }) })
        }
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=read', authUrl))
    await idle()
    await auth.getNewJwtToken()
    assert.equal(auth.getJwtToken(), 'tok-features-2')
    read.resolve(Response.json({ value: 'pre-refresh' }))
    assert.deepEqual(await reading, { value: 'pre-refresh' })

    const older = deferred<Response>()
    const newer = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'older') return older.promise
        if (url.searchParams.get('phase') === 'newer') return newer.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const olderPromise = auth.srvAuthPost(new URL('/signin?phase=older', authUrl), {})
    await idle()
    const newerPromise = auth.srvAuthPost(new URL('/signin?phase=newer', authUrl), {})
    await idle()
    newer.resolve(Response.json({ message: 'Success', token: 'tok-features-newer', metadata: metadata({ features: ['b', 'a'] }) }))
    assert.equal((await Promise.allSettled([newerPromise]))[0]!.status, 'fulfilled')
    older.resolve(Response.json({ message: 'Success', token: 'tok-features-older', metadata: metadata({ features: ['a', 'b'] }) }))
    const [olderResult] = await Promise.allSettled([olderPromise])
    assert.equal(olderResult!.status, 'fulfilled')
    assert.equal(auth.getJwtToken(), 'tok-features-older')
})

test('R3B-002 / R3-F-02: metadata key order does not make a same-session refresh an authorization change', async () => {
    const exp = Date.now() / 1000 + 60
    const urls = { ao_wrapper: ownerUrl, connector: ownerUrl, onlyoffice: ownerUrl }
    const ordered = {
        user_id: 'actor', user_role: 'therapist', customer_id: customer, journal: 'ADOPUS', journal_user_id: 'staff',
        srv_urls: urls, exp, features: ['allowed'], theme: 'host-theme',
    }
    const reordered = {
        theme: 'host-theme', features: ['allowed'], exp, srv_urls: urls, journal_user_id: 'staff',
        journal: 'ADOPUS', customer_id: customer, user_role: 'therapist', user_id: 'actor',
    }
    fetchHandler = async () => Response.json({ message: 'Success', token: 'tok-ordered', metadata: ordered })
    await auth.srvAuthGet(new URL('/login', authUrl))
    const read = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'read') return read.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        if (url.pathname.endsWith('/token')) return Response.json({ message: 'Success', token: 'tok-reordered', metadata: reordered })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const reading = auth.srvAuthGet<{ value: string }>(new URL('/wards?phase=read', authUrl))
    await idle()
    await auth.getNewJwtToken()
    assert.equal(auth.getJwtToken(), 'tok-reordered')
    read.resolve(Response.json({ value: 'pre-refresh' }))
    assert.deepEqual(await reading, { value: 'pre-refresh' })
})

test('R3B-002 / R3-F-02: a late token without user_id is stale even when every other field matches', async () => {
    const withoutUserId = () => metadata({ user_id: undefined })
    const older = deferred<Response>()
    const newer = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'older') return older.promise
        if (url.searchParams.get('phase') === 'newer') return newer.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const olderPromise = auth.srvAuthPost(new URL('/signin?phase=older', authUrl), {})
    await idle()
    const newerPromise = auth.srvAuthPost(new URL('/signin?phase=newer', authUrl), {})
    await idle()
    newer.resolve(Response.json({ message: 'Success', token: 'tok-no-user-newer', metadata: withoutUserId() }))
    assert.equal((await Promise.allSettled([newerPromise]))[0]!.status, 'fulfilled')
    assert.equal(auth.getUserId(), undefined)
    older.resolve(Response.json({ message: 'Success', token: 'tok-no-user-older', metadata: withoutUserId() }))
    const [olderResult] = await Promise.allSettled([olderPromise])
    assert.equal(olderResult!.status, 'rejected')
    assert.equal(stale((olderResult as PromiseRejectedResult).reason), true)
    assert.equal(auth.getJwtToken(), 'tok-no-user-newer')
})

test('R3B-002 / R3-F-02: same ward, the old guardian response lands before the switch completes', async () => {
    const guardian = (id: string, name: string) => ({
        user_id: 'ward',
        journal_user_id: 'ward-journal',
        user_role: 'recipient' as const,
        legal_guardian: { journal_user_id: id, full_name: name, phone_nr: null, pnr: 'synthetic-fixture' },
    })
    await login(guardian('guardian-1', 'Guardian One'), 'tok-g1')
    const old = deferred<Response>()
    const switching = deferred<Response>()
    fetchHandler = async input => {
        const url = new URL(String(input))
        if (url.searchParams.get('phase') === 'old') return old.promise
        if (url.searchParams.get('phase') === 'switch') return switching.promise
        if (url.pathname.endsWith('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const oldPromise = auth.srvAuthPost(new URL('/signin?phase=old', authUrl), {})
    await idle()
    const switchPromise = auth.srvAuthPost(new URL('/signin?phase=switch', authUrl), {})
    await idle()
    old.resolve(Response.json({ message: 'Success', token: 'tok-g1-late', metadata: metadata(guardian('guardian-1', 'Guardian One')) }))
    assert.equal((await Promise.allSettled([oldPromise]))[0]!.status, 'fulfilled')
    assert.equal(auth.getMetadata()?.legal_guardian?.journal_user_id, 'guardian-1')
    assert.equal(auth.getJwtToken(), 'tok-g1-late')
    switching.resolve(Response.json({ message: 'Success', token: 'tok-g2', metadata: metadata(guardian('guardian-2', 'Guardian Two')) }))
    assert.equal((await Promise.allSettled([switchPromise]))[0]!.status, 'fulfilled')
    assert.equal(auth.getMetadata()?.legal_guardian?.journal_user_id, 'guardian-2')
    assert.equal(auth.getJwtToken(), 'tok-g2')
})

test('R3B-002 / R3-F-02: a retired response with a malformed late body reports stale_context, not a parse error (QA witness QA-R3-S08c)', async () => {
    await login()
    const late = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/late-read')) return late.promise
        if (url.includes('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const pending = auth.srvAuthGet(new URL('/late-read', authUrl))
    await idle()
    auth.dispatchLogoutEvent()
    await idle()
    late.resolve(new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    const [result] = await Promise.allSettled([pending])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
})

test('R3B-002 / R3-F-02: identity changing while the body is read rejects stale_context (QA witness QA-R3-S08b)', async () => {
    await login()
    const encoder = new TextEncoder()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/stream-token')) {
            return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (url.includes('/signout')) return Response.json({ message: 'Success' })
        if (url.includes('/login')) return Response.json({ message: 'Success', token: 'tok-relogin', metadata: metadata() })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const pending = auth.srvAuthGet(new URL('/stream-token', authUrl))
    await idle()
    await idle()
    auth.dispatchLogoutEvent()
    await idle()
    await auth.srvAuthGet(new URL('/login?again=1', authUrl))
    assert.equal(auth.getJwtToken(), 'tok-relogin')
    controller.enqueue(encoder.encode(JSON.stringify({ message: 'Success', token: 'tok-pre-logout', metadata: metadata() })))
    controller.close()
    const [result] = await Promise.allSettled([pending])
    assert.equal(result!.status, 'rejected')
    assert.equal(stale((result as PromiseRejectedResult).reason), true)
    assert.equal(auth.getJwtToken(), 'tok-relogin')
})

test('R3B-002 / R3-F-02: a retired editor request with a malformed body resolves empty without an activity failure warning (QA witness QA-R3-S08d)', async t => {
    const warns: string[] = []
    t.mock.method(console, 'warn', (...args: unknown[]) => { warns.push(args.map(String).join(' ')) })
    await login()
    const editor = deferred<Response>()
    fetchHandler = async input => {
        const url = String(input)
        if (url.includes('/legacy-ao/ReadOnlyAccessCheck')) return editor.promise
        if (url.includes('/signout')) return Response.json({ message: 'Success' })
        throw new Error(`Unexpected fixture request: ${url}`)
    }
    const lookup = auth.getActivityStatuses(['7'])
    await idle()
    await idle()
    auth.dispatchLogoutEvent()
    await idle()
    editor.resolve(new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    assert.equal((await lookup).size, 0)
    assert.equal(warns.includes('Activity access request failed'), false)
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

test('owner adapter retries a 401 only while the supplied auth keeps the lease current', async t => {
    // This fake producer deliberately keeps the lease current. The real-producer regression below
    // covers the production fail-closed behavior when a refresh retires the context.
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

test('RQ-05: a real producer refresh retires the lease; host republish creates a new owner client', async t => {
    const context = createSharedContext({
        createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient(auth, ownerUrl, lease),
    })
    t.after(() => context.dispose())
    bindings.generateSrvAuthBindings(undefined, { sharedContext: context })
    await login()
    publish(context)

    let ownerCalls = 0
    let tokenCalls = 0
    fetchHandler = async (input, init) => {
        const request = new Request(input, init)
        if (request.url === ownerUrl) {
            ++ownerCalls
            return ownerCalls === 1 ? new Response(null, { status: 401 }) : Response.json({ data: { value: 'recovered' } })
        }
        if (request.url.endsWith('/token')) {
            ++tokenCalls
            return Response.json({ message: 'Success', token: 'refreshed-token', metadata: metadata() })
        }
        throw new Error(`Unexpected fixture request: ${request.url}`)
    }

    const owner = await context.mount().createOwnerClient('fixture-owner')
    let refusal: unknown
    try {
        await owner.fetch(ownerUrl)
    } catch (error) {
        refusal = error
    }
    assert.equal((refusal as { code?: string } | undefined)?.code, 'stale_context')
    assert.equal(ownerCalls, 1)
    assert.equal(tokenCalls, 1)
    assert.equal(owner.lease.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'pending')
    assert.equal(auth.isJwtValid(), true)

    publish(context)
    const replacement = await context.mount().createOwnerClient('fixture-owner')
    const response = await replacement.fetch(ownerUrl)
    assert.equal(response.status, 200)
    assert.equal((await response.json() as { data: { value: string } }).data.value, 'recovered')
    assert.equal(ownerCalls, 2)
})

test('RQ-06: auth owner adapter sanitizes malformed owner URL without leaking input', t => {
    const secret = 'super-secret'
    const context = createSharedContext()
    t.after(() => context.dispose())
    publish(context)
    const lease = context.mount().capture()
    for (const url of [
        `not a url?token=${secret}`,
        'ftp://owner.invalid/v1/graphql',
        'https://user@owner.invalid/v1/graphql',
        `https://user:${secret}@owner.invalid/v1/graphql`,
        `https://:${secret}@owner.invalid/v1/graphql`,
        `https://user%40name:${secret}@owner.invalid/v1/graphql`,
    ]) {
        let error: unknown
        try {
            bindings.createSrvAuthContextOwnerClient(
                { getCachedJwt: async () => 'token', isJwtValid: () => true, getNewJwtToken: async () => 'token' },
                url,
                lease,
            )
        } catch (caught) {
            error = caught
        }
        assert.ok(error instanceof SharedContextError)
        assert.equal((error as SharedContextError).code, 'wrong_owner_endpoint')
        assert.equal(String(error).includes(secret), false)
        assert.equal((error as Error & { cause?: unknown }).cause, undefined)
    }
})

for (const revocation of ['generation', 'unmount'] as const) {
    test(`owner initial dispatch denies ${revocation} revocation queued before its await continuation`, async t => {
        let calls = 0
        const context = createSharedContext({ createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient({
            getCachedJwt: async () => 'fixture-token',
            isJwtValid: () => {
                queueMicrotask(() => revocation === 'generation' ? context.invalidate('anonymous') : mount.dispose())
                return true
            },
            getNewJwtToken: async () => { throw new Error('No initial dispatch means no refresh') },
        }, ownerUrl, lease) })
        t.after(() => context.dispose())
        publish(context)
        const mount = context.mount()
        const owner = await mount.createOwnerClient('fixture-owner')
        // Deliberately ignores cancellation: authority must prevent invocation itself.
        fetchHandler = async () => { ++calls; return Response.json({ data: 'retired' }) }
        await assert.rejects(owner.fetch(ownerUrl), stale)
        assert.equal(owner.lease.signal.aborted, true)
        assert.equal(calls, 0)
    })

    test(`owner retry dispatch denies ${revocation} revocation queued before its await continuation`, async t => {
        let calls = 0
        let validityChecks = 0
        let refreshes = 0
        const context = createSharedContext({ createOwnerClient: (_owner, lease) => bindings.createSrvAuthContextOwnerClient({
            getCachedJwt: async () => 'fixture-token',
            isJwtValid: () => {
                if (++validityChecks === 2) {
                    queueMicrotask(() => revocation === 'generation' ? context.invalidate('anonymous') : mount.dispose())
                }
                return true
            },
            getNewJwtToken: async () => { ++refreshes; return 'fixture-refreshed' },
        }, ownerUrl, lease) })
        t.after(() => context.dispose())
        publish(context)
        const mount = context.mount()
        const owner = await mount.createOwnerClient('fixture-owner')
        // The first current request may run. An abort-ignoring retired retry may not.
        fetchHandler = async (input, init) => {
            ++calls
            if (calls === 1) {
                assert.equal(owner.lease.isCurrent(), true)
                assert.equal(new Request(input, init).signal.aborted, false)
                return new Response(null, { status: 401 })
            }
            return Response.json({ data: 'retired' })
        }
        await assert.rejects(owner.fetch(ownerUrl), stale)
        assert.equal(validityChecks, 2)
        assert.equal(refreshes, 1)
        assert.equal(owner.lease.signal.aborted, true)
        assert.equal(calls, 1)
    })
}
