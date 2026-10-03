import { SHARED_CONTEXT_REVISION } from './context.types.js'
import type {
    SharedContextBinding,
    SharedContextController,
    SharedContextInactiveStatus,
    SharedContextJournal,
    SharedContextLease,
    SharedContextListener,
    SharedContextOptions,
    SharedContextReadySnapshot,
    SharedContextSnapshot,
    ValidatedSharedContext,
} from './context.types.js'

export class SharedContextError extends Error {
    constructor(readonly code: 'context_unavailable' | 'stale_context' | 'unsupported_revision' | 'disposed' | 'invalid_context' | 'cleanup_failed' | 'owner_unavailable' | 'wrong_owner_endpoint') {
        super(code)
        this.name = 'SharedContextError'
    }
}

function inactive(status: SharedContextInactiveStatus, generation: number): SharedContextSnapshot {
    return Object.freeze({ revision: SHARED_CONTEXT_REVISION, status, generation, actor: null, organization: null, journal: null, selectedRecord: null })
}

function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function journalIsValid(value: SharedContextJournal | null): boolean {
    return value === null || (!!value && (value.journal === 'ADOPUS' || value.journal === 'ADCURIS') && nonempty(value.journal_user_id))
}

function validatedInput(input: ValidatedSharedContext, now: number): boolean {
    if (!input || input.revision !== SHARED_CONTEXT_REVISION || !input.actor || !input.organization) return false
    if (!nonempty(input.actor.user_id) || !['super_user', 'therapist', 'recipient'].includes(input.actor.user_role)) return false
    if (!nonempty(input.organization.customer_id) || !Number.isFinite(input.exp) || input.exp * 1000 <= now) return false
    if (!journalIsValid(input.journal)) return false
    const record = input.selectedRecord
    if (record === null) return true
    if (!record || !nonempty(record.user_id) || record.customer_id !== input.organization.customer_id || !journalIsValid(record.journal)) return false
    if (!['self', 'participant', 'ward'].includes(record.relationship)) return false
    if (record.relationship === 'self' && record.user_id !== input.actor.user_id) return false
    if (record.relationship === 'ward' && record.user_id === input.actor.user_id) return false
    return true
}

function copyJournal(journal: SharedContextJournal | null): SharedContextJournal | null {
    return journal === null ? null : Object.freeze({ journal: journal.journal, journal_user_id: journal.journal_user_id })
}

/** No auth globals, credentials, storage, React root or transport singleton is used. */
export function createSharedContext(options: SharedContextOptions = {}): SharedContextController {
    const now = options.now ?? Date.now
    let generation = 0
    let snapshot = inactive('unavailable', generation)
    let timer: ReturnType<typeof setTimeout> | undefined
    const listeners = new Set<SharedContextListener>()
    const revocations = new Set<() => void>()
    let invalidating = 0

    function notify() {
        let failed = false
        for (const listener of [...listeners]) {
            if (!listeners.has(listener)) continue
            try { listener(snapshot) } catch { failed = true }
        }
        if (failed) throw new SharedContextError('cleanup_failed')
    }

    function clearTimer() {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
    }

    function change(status: SharedContextInactiveStatus) {
        clearTimer()
        const changedGeneration = ++generation
        snapshot = inactive(status, changedGeneration)
        let failed = false
        ++invalidating
        try {
            for (const revoke of [...revocations]) {
                try { revoke() } catch { failed = true }
            }
            if (failed && snapshot.status !== 'disposed') snapshot = inactive('denied', generation)
            notify()
        } finally {
            --invalidating
        }
        if (failed) throw new SharedContextError('cleanup_failed')
        return changedGeneration
    }

    function checkExpiry() {
        if (snapshot.status === 'ready' && snapshot.exp * 1000 <= now()) change('denied')
    }

    function getSnapshot() {
        checkExpiry()
        return snapshot
    }

    function scheduleExpiry() {
        clearTimer()
        if (snapshot.status !== 'ready') return
        timer = setTimeout(() => {
            checkExpiry()
            scheduleExpiry()
        }, Math.min(Math.max(snapshot.exp * 1000 - now(), 0), 2_147_483_647))
        const processTimer: unknown = timer
        if (typeof processTimer === 'object' && processTimer !== null && 'unref' in processTimer && typeof processTimer.unref === 'function') processTimer.unref()
    }

    function subscribe(listener: SharedContextListener) {
        if (snapshot.status === 'disposed') throw new SharedContextError('disposed')
        listeners.add(listener)
        return () => { listeners.delete(listener) }
    }

    const controller: SharedContextController = {
        getSnapshot,
        subscribe,
        invalidate(status = 'pending') {
            if (snapshot.status === 'disposed') throw new SharedContextError('disposed')
            const captured = change(status)
            let published = false
            return Object.freeze({
                generation: captured,
                publish(input: ValidatedSharedContext) {
                    if (invalidating || published || captured !== generation || snapshot.status === 'disposed') return false
                    published = true
                    if (!validatedInput(input, now())) {
                        change('denied')
                        return false
                    }
                    // Whitelist and copy: caller mutation and extra metadata cannot alter/leak a snapshot.
                    snapshot = Object.freeze({
                        revision: SHARED_CONTEXT_REVISION,
                        status: 'ready',
                        generation,
                        actor: Object.freeze({ user_id: input.actor.user_id, user_role: input.actor.user_role }),
                        organization: Object.freeze({ customer_id: input.organization.customer_id }),
                        journal: copyJournal(input.journal),
                        selectedRecord: input.selectedRecord === null ? null : Object.freeze({
                            user_id: input.selectedRecord.user_id,
                            customer_id: input.selectedRecord.customer_id,
                            relationship: input.selectedRecord.relationship,
                            journal: copyJournal(input.selectedRecord.journal),
                        }),
                        exp: input.exp,
                    })
                    scheduleExpiry()
                    try { notify() } catch {
                        change('denied')
                        throw new SharedContextError('cleanup_failed')
                    }
                    return captured === generation && snapshot.status === 'ready'
                },
            })
        },
        mount(revision = SHARED_CONTEXT_REVISION) {
            let live = snapshot.status !== 'disposed'
            const compatible = revision === SHARED_CONTEXT_REVISION
            const mountListeners = new Set<{ listener: SharedContextListener; wrapped: SharedContextListener }>()
            const mountRevocations = new Set<() => void>()

            function mountSnapshot() {
                const current = getSnapshot()
                if (!live || current.status === 'disposed') return inactive('disposed', current.generation)
                return compatible ? current : inactive('denied', current.generation)
            }

            function assertMount() {
                if (!live || snapshot.status === 'disposed') throw new SharedContextError('disposed')
                if (!compatible) throw new SharedContextError('unsupported_revision')
            }

            function capture(): SharedContextLease {
                assertMount()
                const ready = getSnapshot()
                if (ready.status !== 'ready') throw new SharedContextError('context_unavailable')
                const abort = new AbortController()
                const cleanups = new Set<() => void>()
                let revoked = false

                function isCurrent() {
                    checkExpiry()
                    return live && !revoked && snapshot.status === 'ready' && snapshot.generation === ready.generation
                }

                function assertCurrent() {
                    if (!isCurrent()) throw new SharedContextError('stale_context')
                }

                function revoke() {
                    if (revoked) return
                    revoked = true
                    revocations.delete(revoke)
                    mountRevocations.delete(revoke)
                    abort.abort()
                    let failed = false
                    for (const cleanup of [...cleanups]) {
                        try { cleanup() } catch { failed = true }
                    }
                    cleanups.clear()
                    if (failed) throw new SharedContextError('cleanup_failed')
                }

                const lease: SharedContextLease = Object.freeze({
                    snapshot: ready,
                    signal: abort.signal,
                    isCurrent,
                    assertCurrent,
                    onRevoke(cleanup: () => void) {
                        if (!isCurrent()) { cleanup(); return () => {} }
                        cleanups.add(cleanup)
                        return () => { cleanups.delete(cleanup) }
                    },
                    async run<T>(work: (current: SharedContextLease) => T | Promise<T>) {
                        assertCurrent()
                        try {
                            const result = await work(lease)
                            assertCurrent()
                            return result
                        } catch (error) {
                            assertCurrent()
                            throw error
                        }
                    },
                    commit(effect: (current: SharedContextReadySnapshot) => void) {
                        assertCurrent()
                        effect(ready)
                    },
                })
                revocations.add(revoke)
                mountRevocations.add(revoke)
                return lease
            }

            const binding: SharedContextBinding = Object.freeze({
                revision: SHARED_CONTEXT_REVISION,
                getSnapshot: mountSnapshot,
                subscribe(listener: SharedContextListener) {
                    assertMount()
                    const wrapped = () => { if (live) listener(mountSnapshot()) }
                    const subscription = { listener, wrapped }
                    mountListeners.add(subscription)
                    listeners.add(wrapped)
                    return () => { mountListeners.delete(subscription); listeners.delete(wrapped) }
                },
                capture,
                async createOwnerClient(owner: string) {
                    const lease = capture()
                    if (!options.createOwnerClient || !nonempty(owner)) throw new SharedContextError('owner_unavailable')
                    const source = await lease.run(() => options.createOwnerClient!(owner, lease))
                    // Exact owner endpoint only, not a generic foreign-backend gateway.
                    const endpoint = new URL(source.url).href
                    if (!['http:', 'https:'].includes(new URL(endpoint).protocol)) throw new SharedContextError('wrong_owner_endpoint')
                    const ownerFetch: typeof fetch = async (input, init) => {
                        const request = new Request(input, init)
                        lease.assertCurrent()
                        if (request.url !== endpoint) throw new SharedContextError('wrong_owner_endpoint')
                        return lease.run(() => source.fetch(new Request(request, { redirect: 'error', signal: AbortSignal.any([request.signal, lease.signal]) })))
                    }
                    return Object.freeze({ url: endpoint, fetch: ownerFetch, lease })
                },
                dispose() {
                    if (!live) return
                    live = false
                    let failed = false
                    for (const revoke of [...mountRevocations]) {
                        try { revoke() } catch { failed = true }
                    }
                    for (const { listener, wrapped } of [...mountListeners]) {
                        listeners.delete(wrapped)
                        try { listener(mountSnapshot()) } catch { failed = true }
                    }
                    mountListeners.clear()
                    if (failed) throw new SharedContextError('cleanup_failed')
                },
            })
            return binding
        },
        dispose() {
            if (snapshot.status === 'disposed') return
            try { change('disposed') } finally { listeners.clear() }
        },
    }
    return Object.freeze(controller)
}
