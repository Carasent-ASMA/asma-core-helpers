import type { Blocker, History, To } from 'history'

export const OVERLAY_BACK_VERSION = 1 as const
export const OVERLAY_BACK_MARKER_KEY = '__asmaOverlayBack' as const

/** Same-origin, no PII: protocol version, per-document session id, per-arm marker id (SEC-002). */
export interface OverlayBackMarker {
    v: typeof OVERLAY_BACK_VERSION
    s: string
    m: string
}

/** Published at `window.__ASMA__SHELL__.overlayBack` (PAT-002). `enabled` is the kill switch —
 *  ui-core only arms a guard through `register()` once a host turns this on. */
export interface OverlayBackAdapter {
    readonly v: typeof OVERLAY_BACK_VERSION
    enabled: boolean
    /** Registers the current top overlay's close function. Call again (with the new top's
     *  `requestClose`) before unregistering the previous top, so the stack never looks empty
     *  while an overlay is still open. Returns the unregister function for that entry. */
    register: (requestClose: () => void | Promise<unknown>) => () => void
}

type OverlayBackHistoryState = Record<string, unknown> & {
    usr?: unknown
    key?: string
    idx?: number
    [OVERLAY_BACK_MARKER_KEY]?: OverlayBackMarker
}

interface GuardState {
    marker: OverlayBackMarker
    baseKey: string | undefined
    requestClose: () => void | Promise<unknown>
}

type PendingNav = { kind: 'PUSH'; to: To; state: unknown } | { kind: 'REPLACE'; to: To; state: unknown }

export interface OverlayBackInternalState {
    sessionId: string
    idCounter: number
    guard: GuardState | null
    phase: 'rearming' | 'draining' | null
    pendingNav: PendingNav | null
    pendingDrainSnapshot: { href: string; state: OverlayBackHistoryState } | null
    pendingRearmRequestClose: (() => void | Promise<unknown>) | null
    suspended: boolean
    openCount: number
    listenerInstalled: boolean
    historyWrapped: boolean
    activeBlockerCount: number
    originalPush: History['push'] | null
    originalReplace: History['replace'] | null
    public: OverlayBackAdapter
}

declare global {
    interface Window {
        /** Internal adapter state, kept on the window so it survives HMR re-evaluation of this
         *  module and stays consistent if several bundles load their own copy of this package
         *  (CON-010). Not part of the public `overlayBack` contract. */
        __ASMA_OVERLAY_BACK_INTERNAL__?: OverlayBackInternalState
    }
}

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nextMarkerId(internal: OverlayBackInternalState): string {
    internal.idCounter += 1
    return `${internal.idCounter}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateInternal(win: Window): OverlayBackInternalState {
    const existing = win.__ASMA_OVERLAY_BACK_INTERNAL__
    if (existing) {
        return existing
    }

    let internal!: OverlayBackInternalState
    const publicApi: OverlayBackAdapter = {
        v: OVERLAY_BACK_VERSION,
        enabled: false,
        register: (requestClose) => register(win, internal, requestClose),
    }
    internal = {
        sessionId: generateId(),
        idCounter: 0,
        guard: null,
        phase: null,
        pendingNav: null,
        pendingDrainSnapshot: null,
        pendingRearmRequestClose: null,
        suspended: false,
        openCount: 0,
        listenerInstalled: false,
        historyWrapped: false,
        activeBlockerCount: 0,
        originalPush: null,
        originalReplace: null,
        public: publicApi,
    }
    win.__ASMA_OVERLAY_BACK_INTERNAL__ = internal
    return internal
}

function readState(win: Window): OverlayBackHistoryState | null {
    return (win.history.state ?? null) as OverlayBackHistoryState | null
}

function readMarker(state: OverlayBackHistoryState | null): OverlayBackMarker | undefined {
    return state?.[OVERLAY_BACK_MARKER_KEY]
}

/** Init-time cleanup (boot row of §2.6): a reload that lands on a stale guard entry keeps
 *  `usr`/`key`/`idx` but drops the marker, so the page never looks armed for a guard nothing
 *  is managing any more. */
function stripStaleMarker(win: Window): void {
    const state = readState(win)
    if (!state || !readMarker(state)) {
        return
    }
    const { [OVERLAY_BACK_MARKER_KEY]: _marker, ...rest } = state
    try {
        win.history.replaceState(rest, '', win.location.href)
    } catch {
        /* fail open: leave the stale marker rather than risk losing the entry's state */
    }
}

function reconcileAfterRestore(win: Window, internal: OverlayBackInternalState): void {
    const guard = internal.guard
    if (!guard) {
        return
    }
    const marker = readMarker(readState(win))
    if (marker && marker.s === guard.marker.s && marker.m === guard.marker.m) {
        return // restored exactly onto the live guard entry: stay armed
    }
    internal.guard = null
    internal.phase = null
}

function arm(win: Window, internal: OverlayBackInternalState, requestClose: () => void | Promise<unknown>): void {
    if (!internal.public.enabled) {
        return // kill switch off: registry-only, no history write
    }
    const baseState = readState(win)
    const marker: OverlayBackMarker = { v: OVERLAY_BACK_VERSION, s: internal.sessionId, m: nextMarkerId(internal) }
    // CON-003: clone usr/key/idx exactly (never idx+1) so history@5's cached index never desyncs.
    const nextState: OverlayBackHistoryState = {
        ...baseState,
        usr: baseState?.usr,
        key: baseState?.key,
        idx: baseState?.idx,
        [OVERLAY_BACK_MARKER_KEY]: marker,
    }
    try {
        win.history.pushState(nextState, '', win.location.href)
    } catch {
        return // WebKit's 100-push budget or similar: fail open, stay idle
    }
    internal.guard = { marker, baseKey: baseState?.key, requestClose }
    internal.phase = null
}

function finishDrain(win: Window, internal: OverlayBackInternalState): void {
    const snapshot = internal.pendingDrainSnapshot
    internal.pendingDrainSnapshot = null
    if (snapshot) {
        try {
            win.history.replaceState(snapshot.state, '', snapshot.href)
        } catch {
            /* fail open: keep whatever natively landed on B */
        }
    }
    internal.guard = null
    internal.phase = null

    const pendingNav = internal.pendingNav
    internal.pendingNav = null
    const pendingRearm = internal.pendingRearmRequestClose
    internal.pendingRearmRequestClose = null

    if (pendingNav) {
        queueMicrotask(() => runPendingNav(internal, pendingNav))
    } else if (pendingRearm) {
        arm(win, internal, pendingRearm)
    }
}

function runPendingNav(internal: OverlayBackInternalState, pending: PendingNav): void {
    if (pending.kind === 'PUSH') {
        internal.originalPush?.(pending.to, pending.state)
    } else {
        internal.originalReplace?.(pending.to, pending.state)
    }
}

function drain(win: Window, internal: OverlayBackInternalState): void {
    const guard = internal.guard
    if (!guard) {
        return
    }
    const state = readState(win)
    const { [OVERLAY_BACK_MARKER_KEY]: _marker, ...rest } = state ?? {}
    internal.pendingDrainSnapshot = { href: win.location.href, state: rest }
    internal.phase = 'draining'
    try {
        win.history.go(-1)
    } catch {
        internal.guard = null
        internal.phase = null
        internal.pendingDrainSnapshot = null
    }
}

function register(
    win: Window,
    internal: OverlayBackInternalState,
    requestClose: () => void | Promise<unknown>,
): () => void {
    internal.openCount += 1
    if (internal.openCount === 1 && internal.phase === 'draining') {
        internal.pendingRearmRequestClose = requestClose
    } else if (!internal.guard) {
        arm(win, internal, requestClose)
    } else {
        internal.guard = { ...internal.guard, requestClose }
    }

    let unregistered = false
    return () => {
        if (unregistered) {
            return
        }
        unregistered = true
        internal.openCount = Math.max(0, internal.openCount - 1)
        if (internal.openCount === 0 && internal.guard && internal.phase === null) {
            drain(win, internal)
        }
    }
}

function handlePopstate(win: Window, internal: OverlayBackInternalState, event: Event): void {
    if (internal.suspended) {
        return
    }
    if ((event as Event & { singleSpa?: boolean }).singleSpa) {
        return // foreign single-spa reroute event: never ours to suppress
    }

    const state = readState(win)
    const marker = readMarker(state)
    const guard = internal.guard

    if (!guard) {
        if (marker) {
            // Forward landed on a retired guard marker (REQ-006): bounce back, delta is 0 so this
            // never moves a real page.
            ;(event as PopStateEvent).stopImmediatePropagation()
            try {
                win.history.go(-1)
            } catch {
                /* fail open: leave the stray marker in place */
            }
        }
        return
    }

    const landedOnGuard = !!marker && marker.s === guard.marker.s && marker.m === guard.marker.m
    const landedOnBase = !landedOnGuard && (state?.key ?? undefined) === guard.baseKey

    if (internal.phase === 'rearming') {
        if (landedOnGuard) {
            ;(event as PopStateEvent).stopImmediatePropagation()
            internal.phase = null
            void guard.requestClose()
            return
        }
        internal.guard = null
        internal.phase = null
        void guard.requestClose()
        return
    }

    if (internal.phase === 'draining') {
        if (landedOnBase) {
            ;(event as PopStateEvent).stopImmediatePropagation()
            finishDrain(win, internal)
            return
        }
        internal.guard = null
        internal.phase = null
        internal.pendingDrainSnapshot = null
        return
    }

    // armed: expect Back to land on the base entry
    if (landedOnBase) {
        ;(event as PopStateEvent).stopImmediatePropagation()
        internal.phase = 'rearming'
        try {
            win.history.go(1)
        } catch {
            internal.guard = null
            internal.phase = null
        }
        return
    }

    // Landed somewhere neither B nor G recognises (multi-step jump, foreign navigation): fail open.
    internal.guard = null
    internal.phase = null
    void guard.requestClose()
}

function pathOf(to: To, fallback: string): string {
    if (typeof to === 'string') {
        return to.split('?')[0]?.split('#')[0] ?? fallback
    }
    return to.pathname ?? fallback
}

/** Must run before `createBrowserHistory()` (CON-002): the popstate listener added here has to
 *  win the registration-order race against history@5's own listener. Idempotent — a second call
 *  (HMR, several bundle copies) reuses the existing window-level state and adds no listener. */
export function installOverlayBackPopstateListener(win: Window): OverlayBackAdapter {
    const internal = getOrCreateInternal(win)
    if (internal.listenerInstalled) {
        return internal.public
    }
    internal.listenerInstalled = true

    stripStaleMarker(win)

    win.addEventListener('popstate', (event) => handlePopstate(win, internal, event))
    win.addEventListener('pagehide', () => {
        internal.suspended = true
    })
    win.addEventListener('pageshow', (event) => {
        if ((event as PageTransitionEvent).persisted) {
            reconcileAfterRestore(win, internal)
        }
        internal.suspended = false
    })

    return internal.public
}

/** Wraps `push`/`replace`/`block` on the real history instance. Must run after
 *  `createBrowserHistory()` returns, since it wraps that instance's methods. Idempotent. */
export function finishOverlayBackInstall(win: Window, history: History): void {
    const internal = getOrCreateInternal(win)
    if (internal.historyWrapped) {
        return
    }
    internal.historyWrapped = true

    const originalPush = history.push.bind(history)
    const originalReplace = history.replace.bind(history)
    const originalBlock = history.block.bind(history)
    internal.originalPush = originalPush
    internal.originalReplace = originalReplace

    history.push = (to: To, state?: unknown) => {
        const guard = internal.guard
        if (!guard || internal.phase !== null) {
            originalPush(to, state)
            return
        }
        if (internal.pendingNav) {
            console.error('[overlayBack] a navigation is already pending; dropping the conflicting push')
            return
        }
        internal.pendingNav = { kind: 'PUSH', to, state }
        void guard.requestClose()
    }

    history.replace = (to: To, state?: unknown) => {
        const guard = internal.guard
        if (!guard || internal.phase !== null) {
            originalReplace(to, state)
            return
        }
        if (pathOf(to, history.location.pathname) === history.location.pathname) {
            originalReplace(to, state)
            const rawState = readState(win)
            try {
                win.history.replaceState(
                    { ...rawState, [OVERLAY_BACK_MARKER_KEY]: guard.marker },
                    '',
                    win.location.href,
                )
            } catch {
                /* fail open: the replace already landed, just without a re-merged marker */
            }
            return
        }
        if (internal.pendingNav) {
            console.error('[overlayBack] a navigation is already pending; dropping the conflicting replace')
            return
        }
        internal.pendingNav = { kind: 'REPLACE', to, state }
        void guard.requestClose()
    }

    history.block = (blocker: Blocker) => {
        internal.activeBlockerCount += 1
        const unblock = originalBlock(blocker)
        return () => {
            internal.activeBlockerCount = Math.max(0, internal.activeBlockerCount - 1)
            unblock()
        }
    }
}

/** Test-only introspection of the window-singleton state. Never import this outside tests. */
export function __inspectOverlayBackForTests__(win: Window): OverlayBackInternalState | undefined {
    return win.__ASMA_OVERLAY_BACK_INTERNAL__
}
