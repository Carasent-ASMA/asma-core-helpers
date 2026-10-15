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
 *  how the global singleton is reset between tests. */
function setUp(url: string) {
    const win = createTestWindow(url)
    const adapter = installOverlayBackPopstateListener(win)
    const history: History = createBrowserHistory({ window: win as unknown as Window & typeof globalThis })
    finishOverlayBackInstall(win, history)
    return { win, adapter, history }
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

        win.history.back()
        await waitUntil(() => closeCalls === 1)

        assert.equal(listenCalls, 0)
        assert.equal(blockCalls, 0)

        unblock()
        unregister()
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

        let foreignListenCalls = 0
        history.listen(() => {
            foreignListenCalls += 1
        })
        history.push('/other')
        history.back()
        await waitUntil(() => foreignListenCalls === 1)
        assert.equal(foreignListenCalls, 1)
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

        unregister()
        await waitUntil(() => __inspectOverlayBackForTests__(win)?.guard === null)

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
})
