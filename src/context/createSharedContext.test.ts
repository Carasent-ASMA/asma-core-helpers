import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSharedContext, SharedContextError } from './createSharedContext.js'
import type { ValidatedSharedContext, SharedContextController } from './context.types.js'

const customer = '00000000-0000-0000-0000-000000000001'
function validated(overrides: Partial<ValidatedSharedContext> = {}): ValidatedSharedContext {
    return {
        revision: 1,
        actor: { user_id: 'actor', user_role: 'therapist' },
        organization: { customer_id: customer },
        journal: { journal: 'ADOPUS', journal_user_id: 'staff-1' },
        selectedRecord: { user_id: 'patient', customer_id: customer, relationship: 'participant', journal: { journal: 'ADOPUS', journal_user_id: 'patient-1' } },
        exp: Date.now() / 1000 + 60,
        ...overrides,
    }
}
function ready(context: SharedContextController, input = validated()) {
    assert.equal(context.invalidate().publish(input), true)
}
function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}
const stale = (error: unknown) => error instanceof SharedContextError && error.code === 'stale_context'

test('reentrant cleanup cannot publish before all old capabilities are revoked', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const first = context.mount().capture()
    const second = context.mount().capture()
    first.onRevoke(() => {
        const nested = context.invalidate()
        assert.equal(nested.publish(validated()), false)
        assert.equal(second.isCurrent(), false)
    })
    const outer = context.invalidate()
    assert.equal(first.signal.aborted, true)
    assert.equal(second.signal.aborted, true)
    assert.equal(outer.publish(validated()), false)
    ready(context)
})

test('requires host publication; pending/anonymous/denied never inherit actor or selected record', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    const binding = context.mount()
    assert.throws(() => binding.capture(), /context_unavailable/)
    ready(context)
    for (const status of ['pending', 'anonymous', 'denied', 'unavailable'] as const) {
        context.invalidate(status)
        assert.deepEqual([binding.getSnapshot().actor, binding.getSnapshot().selectedRecord], [null, null])
        assert.throws(() => binding.capture(), /context_unavailable/)
    }
})

test('actor remains separate from owner-authorized participant/ward; deselection is explicit null', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    for (const relationship of ['participant', 'ward'] as const) {
        ready(context, validated({ selectedRecord: { user_id: 'other', customer_id: customer, relationship, journal: null } }))
        const current = context.mount().capture().snapshot
        assert.equal(current.actor.user_id, 'actor')
        assert.equal(current.selectedRecord?.user_id, 'other')
    }
    ready(context, validated({ selectedRecord: null }))
    assert.equal(context.getSnapshot().selectedRecord, null)
})

test('snapshots copy only safe fields and cannot be changed through retained producer objects', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    const actor = { user_id: 'actor', user_role: 'therapist' as const, token: 'secret-token', pnr: 'secret-pnr' }
    const input = validated({ actor })
    ready(context, input)
    const snapshot = context.mount().capture().snapshot
    actor.user_id = 'changed'
    assert.equal(snapshot.actor.user_id, 'actor')
    assert.equal(JSON.stringify(snapshot).includes('secret'), false)
    assert.equal(Reflect.set(snapshot.actor, 'user_id', 'changed'), false)
    assert.equal(Object.isFrozen(snapshot.selectedRecord?.journal), true)
})

test('rejects wrong revision, tenant, missing record, conflicting self/ward and UNKNOWN journal', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    const invalid = [
        { ...validated(), revision: 2 },
        { ...validated(), selectedRecord: undefined },
        validated({ selectedRecord: { user_id: 'patient', customer_id: '00000000-0000-0000-0000-000000000002', relationship: 'participant', journal: null } }),
        validated({ selectedRecord: { user_id: 'other', customer_id: customer, relationship: 'self', journal: null } }),
        validated({ selectedRecord: { user_id: 'actor', customer_id: customer, relationship: 'ward', journal: null } }),
        { ...validated(), journal: { journal: 'UNKNOWN', journal_user_id: 'x' } },
        validated({ exp: 0 }),
        validated({ exp: Number.NaN }),
    ]
    for (const input of invalid) {
        const stage = context.invalidate()
        assert.equal(stage.publish(input as ValidatedSharedContext), false)
        assert.equal(context.getSnapshot().status, 'denied')
    }
})

test('old lookups cannot publish after a newer organization/record lookup resolves', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    const first = context.invalidate()
    const second = context.invalidate()
    assert.equal(second.publish(validated({ selectedRecord: null })), true)
    assert.equal(first.publish(validated()), false)
    assert.equal(second.publish(validated()), false)
    assert.equal(context.getSnapshot().selectedRecord, null)
})

test('invalidation revokes before every cleanup and denies late work even when abort is ignored', async t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const lease = context.mount().capture()
    const result = deferred<string>()
    const work = lease.run(() => result.promise)
    const denied = assert.rejects(work, stale)
    let visible: string | undefined = 'old'
    lease.onRevoke(() => {
        assert.equal(lease.isCurrent(), false)
        assert.equal(context.getSnapshot().actor, null)
        visible = undefined
    })
    context.invalidate('anonymous')
    result.resolve('late-secret')
    await denied
    assert.equal(lease.signal.aborted, true)
    assert.throws(() => lease.commit(() => { visible = 'late-secret' }), stale)
    assert.equal(visible, undefined)
})

test('role/org/record changes and A→B→A never resurrect prior leases', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const lease = context.mount().capture()
    ready(context, validated({ actor: { user_id: 'actor', user_role: 'recipient' }, selectedRecord: null }))
    ready(context, validated({ organization: { customer_id: '00000000-0000-0000-0000-000000000002' }, selectedRecord: null }))
    ready(context)
    assert.throws(() => lease.assertCurrent(), stale)
    assert.ok(context.getSnapshot().generation > lease.snapshot.generation)
})

test('unmount revokes that instance, unsubscribes it and cannot affect another concurrent mount', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const first = context.mount()
    const second = context.mount()
    const firstLease = first.capture()
    const secondLease = second.capture()
    const observed: string[] = []
    first.subscribe(snapshot => { observed.push(snapshot.status) })
    first.dispose()
    first.dispose()
    assert.throws(() => firstLease.assertCurrent(), stale)
    assert.equal(secondLease.isCurrent(), true)
    assert.equal(first.getSnapshot().status, 'disposed')
    context.invalidate('pending')
    assert.deepEqual(observed, ['disposed'])
    ready(context)
    assert.equal(context.mount().capture().isCurrent(), true)
    assert.throws(() => first.capture(), /disposed/)
})

test('expiry revokes without interaction, and delayed timers cannot permit a lease at the deadline', t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context, validated({ exp: 2 }))
    const lease = context.mount().capture()
    let cleared = false
    lease.onRevoke(() => { cleared = true })
    t.mock.timers.tick(1000)
    assert.equal(cleared, true)
    assert.equal(context.getSnapshot().status, 'denied')
    assert.throws(() => lease.assertCurrent(), stale)
})

test('incompatible consumer denies without globals; cleanup failures revoke every lease', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const incompatible = context.mount(2)
    assert.equal(incompatible.getSnapshot().actor, null)
    assert.throws(() => incompatible.capture(), /unsupported_revision/)
    const first = context.mount().capture()
    const second = context.mount().capture()
    first.onRevoke(() => { throw Error('sensitive cleanup failure') })
    let cleared = false
    second.onRevoke(() => { cleared = true })
    assert.throws(() => context.invalidate(), /cleanup_failed/)
    assert.equal(cleared, true)
    assert.equal(second.isCurrent(), false)
    assert.equal(context.getSnapshot().status, 'denied')
})

test('owner factory and request completions cannot escape revocation; other endpoints deny', async t => {
    const source = deferred<{ url: string; fetch: typeof fetch }>()
    const context = createSharedContext({ createOwnerClient: () => source.promise })
    t.after(() => context.dispose())
    ready(context)
    const binding = context.mount()
    const pending = binding.createOwnerClient('CHAT')
    const denied = assert.rejects(pending, stale)
    binding.dispose()
    source.resolve({ url: 'https://chat.invalid/v1/graphql', fetch: async () => new Response('{}') })
    await denied
    const response = deferred<Response>()
    let calls = 0
    const live = createSharedContext({ createOwnerClient: () => ({ url: 'https://chat.invalid/v1/graphql', fetch: () => { ++calls; return response.promise } }) })
    t.after(() => live.dispose())
    ready(live)
    const owner = await live.mount().createOwnerClient('CHAT')
    await assert.rejects(owner.fetch('https://storage.invalid/v1/graphql'), /wrong_owner_endpoint/)
    assert.equal(calls, 0)
    const request = owner.fetch(owner.url)
    const late = assert.rejects(request, stale)
    live.invalidate('anonymous')
    response.resolve(new Response('{}'))
    await late
    assert.equal(calls, 1)
})

test('reconnect and retained subscription callbacks cannot refill a cleared owner cache', t => {
    const context = createSharedContext()
    t.after(() => context.dispose())
    ready(context)
    const lease = context.mount().capture()
    const cache = new Map<string, string>()
    let unsubscribed = false
    const receive = (value: string) => lease.commit(() => { cache.set('record', value) })
    lease.onRevoke(() => { unsubscribed = true; cache.clear() })
    receive('allowed')
    context.invalidate('anonymous')
    assert.equal(unsubscribed, true)
    assert.throws(() => receive('old-stream'), stale)
    assert.throws(() => lease.commit(() => { cache.set('record', 'reconnect') }), stale)
    assert.equal(cache.size, 0)
})
