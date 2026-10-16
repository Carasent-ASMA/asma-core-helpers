import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createBrowserHistory } from 'history'
import type { History } from 'history'
import { JSDOM } from 'jsdom'

import {
    __inspectOverlayBackForTests__,
    finishOverlayBackInstall,
    installOverlayBackPopstateListener,
} from './overlayBack.ts'

function createTestWindow(url: string): Window {
    const dom = new JSDOM('', { url, pretendToBeVisual: true })
    return dom.window as unknown as Window
}

/** Mirrors `getHistory()`'s own ordering: the popstate listener must be installed before
 *  `createBrowserHistory()` runs (CON-002). Each test gets its own fresh window, which is itself
 *  how the global singleton is reset between tests. Does not simulate a gesture, so the arming
 *  gate fails by default — use `setUp()` for tests that need an armed guard. */
function setUpAdapter(url: string) {
    const win = createTestWindow(url)
    const adapter = installOverlayBackPopstateListener(win)
    const history: History = createBrowserHistory({ window: win as unknown as Window & typeof globalThis })
    finishOverlayBackInstall(win, history)
    return { win, adapter, history }
}

/** jsdom cannot dispatch a genuinely trusted event, so the arming gate's gesture side is
 *  simulated by writing directly to the live internal state (see
 *  `__inspectOverlayBackForTests__`'s doc comment). */
function simulateTrustedGesture(win: Window): void {
    const internal = __inspectOverlayBackForTests__(win)
    if (internal) {
        internal.lastGestureAt = Date.now()
    }
}

/** Same as `setUpAdapter`, plus a simulated trusted gesture, so `register()` passes the arming
 *  gate — the shape every non-gate-focused test in this suite needs. */
function setUp(url: string) {
    const result = setUpAdapter(url)
    simulateTrustedGesture(result.win)
    return result
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('waitUntil: timed out waiting for condition')
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

function dispatchPersistedPageShow(win: Window): void {
    const event = new win.Event('pageshow')
    Object.defineProperty(event, 'persisted', { value: true })
    win.dispatchEvent(event)
}

describe('overlayBack adapter', () => {
    it('TEST-001: arm clones usr, key and idx, keeps unknown fields, and leaves the URL unchanged', () => {
        const { win, adapter } = setUp('https://example.test/orders')
        win.history.replaceState(
            { usr: { foo: 'bar' }, key: 'base-key', idx: 3, customField: 'keep-me' },
            '',
            win.location.href,
        )
        const hrefBefore = win.location.href

        adapter.enabled = true
        const unregister = adapter.register(() => {})

        const state = win.history.state as Record<string, unknown>
        assert.deepEqual(state.usr, { foo: 'bar' })
        assert.equal(state.key, 'base-key')
        assert.equal(state.idx, 3)
        assert.equal(state.customField, 'keep-me')
        assert.equal(win.location.href, hrefBefore)

        const marker = state.__asmaOverlayBack as { v: number; s: string; m: string }
        assert.equal(marker.v, 1)
        assert.equal(typeof marker.s, 'string')
        assert.equal(typeof marker.m, 'string')

        unregister()
    })

    it('TEST-002: owned hops bypass history.listen and history.block; a foreign popstate passes through', async () => {
        const { win, adapter, history } = setUp('https://example.test/list')
        adapter.enabled = true

        let listenCalls = 0
        history.listen(() => {
            listenCalls += 1
        })
        let blockCalls = 0
        const unblock = history.block(() => {
            blockCalls += 1
        })

        let closeCalls = 0
        const unregister = adapter.register(() => {
            closeCalls += 1
        })

        // Registered after the adapter and after history@5, so it only stays silent when the adapter
        // actually stops the event. history.listen stays at 0 either way: the guard clones idx, so
        // history@5 sees a zero delta and ignores the pop on its own.
        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })

        win.history.back()
        await waitUntil(() => closeCalls === 1)

        assert.equal(listenCalls, 0)
        assert.equal(blockCalls, 0)
        assert.equal(lateCalls, 0)

        const forgedState = {
            ...(win.history.state as Record<string, unknown>),
            key: 'forged-key',
            __asmaOverlayBack: { v: 1, s: 'forged-session', m: 'forged-marker' },
        }
        win.history.pushState(forgedState, '', win.location.href)
        win.dispatchEvent(new win.PopStateEvent('popstate'))
        assert.equal(lateCalls, 1)
        assert.equal(closeCalls, 2)

        unblock()
        unregister()
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

        let foreignListenCalls = 0
        history.listen(() => {
            foreignListenCalls += 1
        })
        history.push('/other')
        // The push itself notifies listeners synchronously — isolate the baseline from it so the
        // assertion below can only be satisfied by the back()'s popstate, not by this push.
        const listenCallsAfterPush = foreignListenCalls
        assert.equal(listenCallsAfterPush, 1)

        history.back()
        await waitUntil(() => foreignListenCalls === listenCallsAfterPush + 1)
        assert.equal(foreignListenCalls, listenCallsAfterPush + 1)
    })

    it('ignores a single-spa popstate even when its state resembles the live guard', () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        let closeCalls = 0
        const unregister = adapter.register(() => {
            closeCalls += 1
        })
        const guardBefore = __inspectOverlayBackForTests__(win)?.guard
        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })

        const event = new win.PopStateEvent('popstate') as PopStateEvent & { singleSpa?: boolean }
        event.singleSpa = true
        win.dispatchEvent(event)

        assert.equal(closeCalls, 0)
        assert.equal(lateCalls, 1)
        assert.equal(__inspectOverlayBackForTests__(win)?.guard, guardBefore)
        unregister()
    })

    it('does not consume or close anything while pagehide has suspended the adapter', () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        let closeCalls = 0
        const unregister = adapter.register(() => {
            closeCalls += 1
        })
        const guardBefore = __inspectOverlayBackForTests__(win)?.guard
        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })

        win.dispatchEvent(new win.Event('pagehide'))
        win.dispatchEvent(new win.PopStateEvent('popstate'))

        assert.equal(closeCalls, 0)
        assert.equal(lateCalls, 1)
        assert.equal(__inspectOverlayBackForTests__(win)?.guard, guardBefore)
        unregister()
    })

    it('reconciles the exact marker identity after a bfcache restore', () => {
        const exact = setUp('https://example.test/list')
        exact.adapter.enabled = true
        exact.adapter.register(() => {})
        const exactInternal = __inspectOverlayBackForTests__(exact.win)!
        const exactGuard = exactInternal.guard
        exact.win.dispatchEvent(new exact.win.Event('pagehide'))
        dispatchPersistedPageShow(exact.win)
        assert.equal(exactInternal.guard, exactGuard)
        assert.equal(exactInternal.suspended, false)

        const mismatch = setUp('https://example.test/list')
        mismatch.adapter.enabled = true
        mismatch.adapter.register(() => {})
        const mismatchInternal = __inspectOverlayBackForTests__(mismatch.win)!
        const marker = (mismatch.win.history.state as Record<string, unknown>).__asmaOverlayBack as Record<
            string,
            unknown
        >
        mismatch.win.history.replaceState(
            { ...mismatch.win.history.state, __asmaOverlayBack: { ...marker, v: 2 } },
            '',
            mismatch.win.location.href,
        )
        mismatchInternal.pendingNav = { kind: 'PUSH', to: '/stale', state: undefined }
        mismatch.win.dispatchEvent(new mismatch.win.Event('pagehide'))
        dispatchPersistedPageShow(mismatch.win)

        assert.equal(mismatchInternal.guard, null)
        assert.equal(mismatchInternal.pendingNav, null)
        assert.equal(mismatchInternal.suspended, false)
    })

    it('BACK-6: Forward bounces off a retired guard marker without reopening an overlay', async () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        const unregister = adapter.register(() => {})
        unregister()
        const internal = __inspectOverlayBackForTests__(win)!
        await waitUntil(() => internal.guard === null)

        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })
        win.history.forward()
        await waitUntil(() => internal.retiredBouncePending)
        await waitUntil(() => !internal.retiredBouncePending)

        assert.equal(lateCalls, 0)
        assert.equal((win.history.state as Record<string, unknown>).__asmaOverlayBack, undefined)
    })

    it('does not suppress markers whose version, session or marker id differs from the retired guard', async () => {
        for (const field of ['v', 's', 'm'] as const) {
            const { win, adapter } = setUp('https://example.test/list')
            adapter.enabled = true
            const unregister = adapter.register(() => {})
            unregister()
            const internal = __inspectOverlayBackForTests__(win)!
            await waitUntil(() => internal.guard === null)
            const retired = internal.retiredMarker!
            const forged = { ...retired, [field]: field === 'v' ? 2 : `forged-${field}` }
            win.history.pushState({ ...win.history.state, __asmaOverlayBack: forged }, '', win.location.href)
            let lateCalls = 0
            win.addEventListener('popstate', () => {
                lateCalls += 1
            })

            win.dispatchEvent(new win.PopStateEvent('popstate'))

            assert.equal(lateCalls, 1)
            assert.equal(internal.retiredBouncePending, false)
        }
    })

    it('does not suppress a forged marker when there is no matching retired guard', () => {
        const { win } = setUp('https://example.test/list')
        win.history.pushState(
            { ...win.history.state, __asmaOverlayBack: { v: 1, s: 'forged-session', m: 'forged-marker' } },
            '',
            win.location.href,
        )
        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })

        win.dispatchEvent(new win.PopStateEvent('popstate'))

        assert.equal(lateCalls, 1)
        assert.deepEqual((win.history.state as Record<string, unknown>).__asmaOverlayBack, {
            v: 1,
            s: 'forged-session',
            m: 'forged-marker',
        })
    })

    it('disabling the feature drains an armed guard without closing the overlay', async () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        let closeCalls = 0
        const unregister = adapter.register(() => {
            closeCalls += 1
        })
        assert.ok(__inspectOverlayBackForTests__(win)?.guard)

        adapter.enabled = false
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

        assert.equal(closeCalls, 0)
        assert.equal((win.history.state as Record<string, unknown>).__asmaOverlayBack, undefined)
        unregister()
    })

    it('drains instead of calling a stale closer when the last overlay unregisters during rearm', async () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        let closeCalls = 0
        const unregister = adapter.register(() => {
            closeCalls += 1
        })
        const internal = __inspectOverlayBackForTests__(win)!
        internal.phase = 'rearming'
        unregister()

        win.dispatchEvent(new win.PopStateEvent('popstate'))
        await waitUntil(() => internal.guard === null)

        assert.equal(closeCalls, 0)
        assert.equal(internal.openCount, 0)
        assert.equal((win.history.state as Record<string, unknown>).__asmaOverlayBack, undefined)
    })

    it('cancels a pending rearm when its replacement overlay unregisters during drain', () => {
        const { win, adapter } = setUp('https://example.test/list')
        adapter.enabled = true
        const unregisterOriginal = adapter.register(() => {})
        const internal = __inspectOverlayBackForTests__(win)!
        internal.openCount = 0
        internal.phase = 'draining'

        const unregisterReplacement = adapter.register(() => {})
        assert.ok(internal.pendingRearmRequestClose)
        unregisterReplacement()

        assert.equal(internal.openCount, 0)
        assert.equal(internal.pendingRearmRequestClose, null)
        unregisterOriginal()
    })

    it('a refused close fails open for push and cross-path replace instead of blocking forever', async () => {
        for (const kind of ['push', 'replace'] as const) {
            const { win, adapter, history } = setUp('https://example.test/list')
            adapter.enabled = true
            let closeCalls = 0
            const unregister = adapter.register(() => {
                closeCalls += 1
                return false
            })

            history[kind]('/checkout')
            await waitUntil(() => history.location.pathname === '/checkout')

            assert.equal(closeCalls, 1)
            assert.equal(__inspectOverlayBackForTests__(win)?.pendingNav, null)
            assert.equal(__inspectOverlayBackForTests__(win)?.guard, null)
            assert.equal((win.history.state as Record<string, unknown>).__asmaOverlayBack, undefined)
            unregister()
        }
    })

    it('continues a pending route through each registry layer before draining', async () => {
        const { adapter, history } = setUp('https://example.test/list')
        adapter.enabled = true
        let layers = 2
        let closeCalls = 0
        const unregister: () => void = adapter.register(() => {
            closeCalls += 1
            layers -= 1
            if (layers === 0) unregister()
        })

        history.push('/checkout')
        assert.equal(adapter.pendingNavigation, true)
        assert.equal(history.location.pathname, '/list')
        assert.equal(closeCalls, 1)

        adapter.continuePendingNavigation()
        await waitUntil(() => history.location.pathname === '/checkout')

        assert.equal(closeCalls, 2)
        assert.equal(adapter.pendingNavigation, false)
    })

    it('TEST-003: push while armed defers until the overlay closes, landing on C; a blocker on B prompts once', async () => {
        const { win: _win, adapter, history } = setUp('https://example.test/home')
        history.push('/list')
        adapter.enabled = true

        let blockCalls = 0
        const unblock = history.block((tx) => {
            blockCalls += 1
            unblock()
            tx.retry()
        })

        let closeCalls = 0
        const unregister: () => void = adapter.register(() => {
            closeCalls += 1
            unregister()
        })

        history.push('/checkout')

        await waitUntil(() => history.location.pathname === '/checkout')
        assert.equal(closeCalls, 1)
        assert.equal(blockCalls, 1)

        history.back()
        await waitUntil(() => history.location.pathname === '/list')
        history.forward()
        await waitUntil(() => history.location.pathname === '/checkout')
    })

    it('TEST-004: a same-path replace keeps the marker without draining; a cross-path replace defers', async () => {
        const { win, adapter, history } = setUp('https://example.test/home')
        history.push('/list')
        adapter.enabled = true

        let closeCalls = 0
        const unregister: () => void = adapter.register(() => {
            closeCalls += 1
            unregister()
        })

        const markerBefore = (win.history.state as Record<string, unknown>).__asmaOverlayBack
        assert.ok(markerBefore)

        history.replace({ pathname: '/list', search: '?page=2' })

        const stateAfterSamePath = win.history.state as Record<string, unknown>
        assert.deepEqual(stateAfterSamePath.__asmaOverlayBack, markerBefore)
        assert.equal(win.location.search, '?page=2')
        assert.equal(closeCalls, 0)
        const internalMid = __inspectOverlayBackForTests__(win)
        assert.ok(internalMid?.guard)
        assert.equal(internalMid?.phase, null)

        history.replace('?page=3')
        assert.equal(win.location.search, '?page=3')
        assert.equal(closeCalls, 0)
        assert.deepEqual((win.history.state as Record<string, unknown>).__asmaOverlayBack, markerBefore)

        history.replace('/checkout')
        await waitUntil(() => history.location.pathname === '/checkout')
        assert.equal(closeCalls, 1)
    })

    it('TEST-005: a raw replaceState at G carries over onto B when the guard drains', async () => {
        const { win, adapter, history } = setUp('https://example.test/home')
        history.push('/list?x=1')
        adapter.enabled = true

        const unregister = adapter.register(() => {})

        const rawBefore = win.history.state as Record<string, unknown>
        win.history.replaceState(
            { ...rawBefore, usr: { ...(rawBefore.usr as Record<string, unknown> | undefined), extra: 'raw' } },
            '',
            'https://example.test/list?x=2',
        )

        let lateCalls = 0
        win.addEventListener('popstate', () => {
            lateCalls += 1
        })
        unregister()
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

        assert.equal(lateCalls, 0)
        assert.equal(win.location.search, '?x=2')
        assert.equal(history.location.pathname, '/list')
        const finalState = win.history.state as Record<string, unknown>
        assert.equal((finalState.usr as Record<string, unknown>).extra, 'raw')
    })

    it('TEST-006: a second install adds no listener; a marker present at init is stripped', () => {
        const win = createTestWindow('https://example.test/reload')
        win.history.replaceState(
            {
                usr: { a: 1 },
                key: 'k9',
                idx: 4,
                __asmaOverlayBack: { v: 1, s: 'old-session', m: 'old-marker' },
            },
            '',
            win.location.href,
        )

        const nativeAddEventListener = win.addEventListener.bind(win)
        let popstateListenerCount = 0
        win.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
            if (type === 'popstate') {
                popstateListenerCount += 1
            }
            return nativeAddEventListener(type, listener, options as boolean | AddEventListenerOptions | undefined)
        }) as typeof win.addEventListener

        const adapter1 = installOverlayBackPopstateListener(win)
        const adapter2 = installOverlayBackPopstateListener(win)

        assert.equal(popstateListenerCount, 1)
        assert.equal(adapter1, adapter2)

        const state = win.history.state as Record<string, unknown>
        assert.equal(state.__asmaOverlayBack, undefined)
        assert.deepEqual(state.usr, { a: 1 })
        assert.equal(state.key, 'k9')
        assert.equal(state.idx, 4)
        assert.equal(win.location.href, 'https://example.test/reload')
    })

    it('preserves the current scroll position while draining the guard entry', async () => {
        const { win, adapter } = setUp('https://example.test/list')
        let scrollX = 24
        let scrollY = 800
        Object.defineProperties(win, {
            scrollX: { configurable: true, get: () => scrollX },
            scrollY: { configurable: true, get: () => scrollY },
        })
        win.scrollTo = ((x: number, y: number) => {
            scrollX = x
            scrollY = y
        }) as typeof win.scrollTo

        adapter.enabled = true
        const unregister = adapter.register(() => {})
        const nativeGo = win.history.go.bind(win.history)
        win.history.go = ((delta?: number) => {
            if (delta === -1) {
                scrollX = 0
                scrollY = 0
            }
            nativeGo(delta)
        }) as typeof win.history.go

        unregister()
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

        assert.deepEqual([scrollX, scrollY], [24, 800])
    })

    it('fails open when a fire-and-forget closer leaves the overlay mounted', async () => {
        const { adapter, history } = setUp('https://example.test/list')
        adapter.enabled = true
        adapter.register(() => {})

        history.push('/checkout')
        await waitUntil(() => history.location.pathname === '/checkout', 100)

        assert.equal(adapter.pendingNavigation, false)
    })
})

describe('overlayBack arming gate', () => {
    it('arms an already-registered overlay when the host enables the feature', () => {
        const { win, adapter } = setUp('https://example.test/list')
        const unregister = adapter.register(() => {})
        assert.equal(__inspectOverlayBackForTests__(win)?.guard, null)

        adapter.enabled = true

        assert.ok(__inspectOverlayBackForTests__(win)?.guard)
        assert.ok((win.history.state as Record<string, unknown>).__asmaOverlayBack)
        unregister()
    })

    it('gate-pass: a trusted gesture newer than the last popstate arms the guard', () => {
        const { win, adapter } = setUpAdapter('https://example.test/list')
        simulateTrustedGesture(win)
        adapter.enabled = true

        const unregister = adapter.register(() => {})

        const state = win.history.state as Record<string, unknown>
        assert.ok(state.__asmaOverlayBack)
        assert.ok(__inspectOverlayBackForTests__(win)?.guard)

        unregister()
    })

    it('gate-fail: no trusted gesture recorded yet keeps the overlay registry-only', () => {
        const { win, adapter } = setUpAdapter('https://example.test/list')
        adapter.enabled = true

        const stateBefore = win.history.state
        const lengthBefore = win.history.length

        const unregister = adapter.register(() => {})

        assert.equal(win.history.state, stateBefore)
        assert.equal(win.history.length, lengthBefore)
        assert.equal(__inspectOverlayBackForTests__(win)?.guard, null)

        unregister()
    })

    it('gate-fail: a popstate after the last gesture keeps the overlay registry-only', async () => {
        const { win, adapter, history } = setUpAdapter('https://example.test/home')
        history.push('/list')
        simulateTrustedGesture(win)

        // A navigation lands after the gesture, so the gesture is no longer the newest signal.
        history.back()
        await waitUntil(() => history.location.pathname === '/home')

        adapter.enabled = true
        const lengthBefore = win.history.length
        const unregister = adapter.register(() => {})

        assert.equal(__inspectOverlayBackForTests__(win)?.guard, null)
        assert.equal(win.history.length, lengthBefore)

        unregister()
    })

    it('gate-fail: navigator.userActivation.isActive === false overrides a fresh gesture', () => {
        const { win, adapter } = setUpAdapter('https://example.test/list')
        simulateTrustedGesture(win)
        Object.defineProperty(win.navigator, 'userActivation', {
            value: { isActive: false },
            configurable: true,
        })
        adapter.enabled = true

        const lengthBefore = win.history.length
        const unregister = adapter.register(() => {})

        assert.equal(__inspectOverlayBackForTests__(win)?.guard, null)
        assert.equal(win.history.length, lengthBefore)

        unregister()
    })
})
