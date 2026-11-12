import type { History, To } from 'history'

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
    readonly pendingNavigation: boolean
    /** Registers the current top overlay's close function. Call again (with the new top's
     *  `requestClose`) before unregistering the previous top, so the stack never looks empty
     *  while an overlay is still open. Returns the unregister function for that entry. */
    register: (requestClose: () => false | void | Promise<unknown>) => () => void
    /** Ask the current registry top to close after the previous top unregistered. */
    continuePendingNavigation: () => void
    /** Complete a pending route intent when the current top explicitly cannot close. */
    failOpenPendingNavigation: () => void
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
    /** history@5 index cloned from the base entry on arm (CON-003); the guard entry shares it. */
    baseIdx: number | undefined
    requestClose: () => false | void | Promise<unknown>
}

type PendingNav = { kind: 'PUSH'; to: To; state: unknown } | { kind: 'REPLACE'; to: To; state: unknown }

export interface OverlayBackInternalState {
    sessionId: string
    idCounter: number
    guard: GuardState | null
    phase: 'rearming' | 'draining' | null
    pendingNav: PendingNav | null
    pendingDrainSnapshot: { href: string; state: OverlayBackHistoryState; scrollX: number; scrollY: number } | null
    pendingCloseAttempt: number
    pendingRearmRequestClose: (() => false | void | Promise<unknown>) | null
    retiredMarker: OverlayBackMarker | null
    retiredBaseKey: string | undefined
    retiredBouncePending: boolean
    disablePending: boolean
    enabled: boolean
    currentRequestClose: (() => false | void | Promise<unknown>) | null
    registrations: Array<() => false | void | Promise<unknown>>
    suspended: boolean
    openCount: number
    listenerInstalled: boolean
    historyWrapped: boolean
    /** Timestamp (ms) of the last trusted click, non-Escape keydown, touchend or pointerup. */
    lastGestureAt: number
    /** Timestamp (ms) of the last popstate, owned or foreign. */
    lastPopstateAt: number
    /** history@5 `idx` of the entry this adapter last saw the document on. Read on every popstate,
     *  wrapped push/replace and guard retirement; a raw `pushState` the wrapper never sees leaves
     *  it stale until the next hop. Tells a bounce off a retired guard whether Back arrived from an
     *  entry ahead of it (ASMA-8894) or Forward arrived from the base (REQ-006). */
    lastSeenIdx: number | undefined
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
        get enabled() {
            return internal.enabled
        },
        set enabled(enabled: boolean) {
            setOverlayBackEnabled(win, internal, enabled)
        },
        get pendingNavigation() {
            return internal.pendingNav !== null
        },
        register: (requestClose) => register(win, internal, requestClose),
        continuePendingNavigation: () => {
            const guard = internal.guard
            if (internal.pendingNav && guard && internal.phase === null) {
                requestCloseForPendingNavigation(win, internal, guard)
            }
        },
        failOpenPendingNavigation: () => failOpenPendingNavigation(win, internal),
    }
    internal = {
        sessionId: generateId(),
        idCounter: 0,
        guard: null,
        phase: null,
        pendingNav: null,
        pendingDrainSnapshot: null,
        pendingCloseAttempt: 0,
        pendingRearmRequestClose: null,
        retiredMarker: null,
        retiredBaseKey: undefined,
        retiredBouncePending: false,
        disablePending: false,
        enabled: false,
        currentRequestClose: null,
        registrations: [],
        suspended: false,
        openCount: 0,
        listenerInstalled: false,
        historyWrapped: false,
        lastGestureAt: Number.NEGATIVE_INFINITY,
        lastPopstateAt: Number.NEGATIVE_INFINITY,
        lastSeenIdx: undefined,
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

function markerMatches(marker: OverlayBackMarker | undefined, expected: OverlayBackMarker | null): boolean {
    return !!marker && !!expected && marker.v === expected.v && marker.s === expected.s && marker.m === expected.m
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
    if (markerMatches(marker, guard.marker)) {
        return // restored exactly onto the live guard entry: stay armed
    }
    internal.guard = null
    internal.phase = null
    internal.pendingNav = null
    internal.pendingDrainSnapshot = null
    internal.pendingRearmRequestClose = null
    internal.disablePending = false
}

/** Biased toward no guard (REQ per the arming gate spec): arms only when the API says the page
 *  hasn't lost user activation, and the last trusted gesture is newer than the last popstate —
 *  otherwise an overlay that opened without a fresh click/tap/key (idle-timeout dialog, a result
 *  dialog after a long request, or one opened programmatically right after a Back press) gets no
 *  guard and falls back to today's behaviour. */
function armingGatePasses(win: Window, internal: OverlayBackInternalState): boolean {
    const userActivation = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
    if (userActivation?.isActive === false) {
        return false
    }
    return internal.lastGestureAt > internal.lastPopstateAt
}

function setOverlayBackEnabled(win: Window, internal: OverlayBackInternalState, enabled: boolean): void {
    if (internal.enabled === enabled) return
    internal.enabled = enabled
    if (enabled) {
        internal.disablePending = false
        if (internal.guard && internal.phase === 'draining' && internal.currentRequestClose) {
            internal.pendingRearmRequestClose = internal.currentRequestClose
            return
        }
        if (!internal.guard && internal.openCount > 0 && internal.currentRequestClose) {
            arm(win, internal, internal.currentRequestClose)
        }
        return
    }

    internal.pendingRearmRequestClose = null
    if (!internal.guard) return
    if (internal.phase === null) {
        drain(win, internal)
    } else {
        internal.disablePending = true
    }
}

function arm(win: Window, internal: OverlayBackInternalState, requestClose: () => false | void | Promise<unknown>): void {
    if (!internal.public.enabled) {
        return // kill switch off: registry-only, no history write
    }
    if (!armingGatePasses(win, internal)) {
        return // gate fails: registry-only, no history write
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
    internal.guard = { marker, baseKey: baseState?.key, baseIdx: baseState?.idx, requestClose }
    internal.lastSeenIdx = baseState?.idx
    internal.retiredMarker = null
    internal.retiredBaseKey = undefined
    internal.retiredBouncePending = false
    internal.phase = null
}

function finishDrain(win: Window, internal: OverlayBackInternalState): void {
    const retiredMarker = internal.guard?.marker ?? null
    const snapshot = internal.pendingDrainSnapshot
    const retiredBaseKey = snapshot?.state.key ?? internal.guard?.baseKey
    internal.pendingDrainSnapshot = null
    if (snapshot) {
        try {
            win.history.replaceState(snapshot.state, '', snapshot.href)
        } catch {
            /* fail open: keep whatever natively landed on B */
        }
        if (win.scrollX !== snapshot.scrollX || win.scrollY !== snapshot.scrollY) {
            try {
                win.scrollTo(snapshot.scrollX, snapshot.scrollY)
            } catch {
                /* fail open: route state is more important than scroll restoration */
            }
        }
    }
    internal.guard = null
    internal.retiredMarker = retiredMarker
    internal.retiredBaseKey = retiredBaseKey
    internal.phase = null
    internal.disablePending = false

    const pendingNav = internal.pendingNav
    internal.pendingNav = null
    const pendingRearm = internal.pendingRearmRequestClose
    internal.pendingRearmRequestClose = null

    if (pendingNav) {
        queueMicrotask(() => runPendingNav(win, internal, pendingNav))
    } else if (pendingRearm) {
        arm(win, internal, pendingRearm)
    }
}

function runPendingNav(win: Window, internal: OverlayBackInternalState, pending: PendingNav): void {
    if (pending.kind === 'PUSH') {
        internal.originalPush?.(pending.to, pending.state)
    } else {
        internal.originalReplace?.(pending.to, pending.state)
    }
    internal.lastSeenIdx = readState(win)?.idx
}

function failOpenPendingNavigation(win: Window, internal: OverlayBackInternalState): void {
    const pending = internal.pendingNav
    if (!pending) return
    const state = readState(win)
    const marker = readMarker(state)
    if (markerMatches(marker, internal.guard?.marker ?? null)) {
        const { [OVERLAY_BACK_MARKER_KEY]: _marker, ...rest } = state ?? {}
        try {
            win.history.replaceState(rest, '', win.location.href)
        } catch {
            // The intent must not remain blocked merely because marker cleanup failed.
        }
    }
    internal.pendingNav = null
    internal.pendingDrainSnapshot = null
    internal.retiredMarker = internal.guard?.marker ?? internal.retiredMarker
    internal.retiredBaseKey = internal.guard?.baseKey ?? internal.retiredBaseKey
    internal.guard = null
    internal.phase = null
    queueMicrotask(() => runPendingNav(win, internal, pending))
}

function requestCloseForPendingNavigation(
    win: Window,
    internal: OverlayBackInternalState,
    guard: GuardState,
): void {
    const attempt = ++internal.pendingCloseAttempt
    let result: false | void | Promise<unknown>
    try {
        result = guard.requestClose()
    } catch (error) {
        console.error('[overlayBack] overlay closer threw; continuing the pending navigation', error)
        failOpenPendingNavigation(win, internal)
        return
    }
    if (result === false) failOpenPendingNavigation(win, internal)
    else {
        const failOpenIfStalled = (): void => {
            if (
                internal.pendingNav &&
                internal.guard === guard &&
                internal.phase === null &&
                internal.pendingCloseAttempt === attempt
            ) {
                failOpenPendingNavigation(win, internal)
            }
        }
        const scheduleFailOpen = (): void => {
            win.setTimeout(failOpenIfStalled, 0)
        }
        if (result && typeof (result as Promise<unknown>).then === 'function') {
            void (result as Promise<unknown>).then(scheduleFailOpen, scheduleFailOpen)
            return
        }
        win.setTimeout(() => {
            failOpenIfStalled()
        }, 0)
    }
}

/** True when the document is no longer on the guard entry. history@5's blocker `retry` closes over
 *  the real, unwrapped `push`, so an unsaved-changes prompt that replays the blocked push on
 *  "discard" lands past the guard while the prompt is still registered, and this wrapper never
 *  sees the hop (ASMA-8894). Only a push moves `idx`; a raw `replaceState` that wiped the marker
 *  keeps it and still counts as the guard (TEST-005). No `idx` at all: assume the guard. */
function guardEntryAbandoned(win: Window, guard: GuardState): boolean {
    const state = readState(win)
    if (markerMatches(readMarker(state), guard.marker)) {
        return false
    }
    const idx = state?.idx
    return typeof idx === 'number' && typeof guard.baseIdx === 'number' && idx !== guard.baseIdx
}

/** Drop a guard whose entry is behind the current one without moving history — a `go(-1)` here
 *  would pop the entry the app just navigated to. The marker still sits on the abandoned entry, so
 *  it is retired for the bounce (REQ-006), and a route intent queued against the dead guard runs. */
function retireAbandonedGuard(win: Window, internal: OverlayBackInternalState): void {
    const guard = internal.guard
    if (!guard) {
        return
    }
    internal.guard = null
    internal.phase = null
    internal.pendingDrainSnapshot = null
    internal.pendingRearmRequestClose = null
    internal.disablePending = false
    internal.retiredMarker = guard.marker
    internal.retiredBaseKey = guard.baseKey
    internal.lastSeenIdx = readState(win)?.idx

    const pendingNav = internal.pendingNav
    internal.pendingNav = null
    if (pendingNav) {
        queueMicrotask(() => runPendingNav(win, internal, pendingNav))
    }
}

function drain(win: Window, internal: OverlayBackInternalState): void {
    const guard = internal.guard
    if (!guard) {
        return
    }
    if (guardEntryAbandoned(win, guard)) {
        retireAbandonedGuard(win, internal)
        return
    }
    const state = readState(win)
    const { [OVERLAY_BACK_MARKER_KEY]: _marker, ...rest } = state ?? {}
    internal.pendingDrainSnapshot = {
        href: win.location.href,
        state: rest,
        scrollX: win.scrollX,
        scrollY: win.scrollY,
    }
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
    requestClose: () => false | void | Promise<unknown>,
): () => void {
    internal.registrations.push(requestClose)
    internal.openCount = internal.registrations.length
    internal.currentRequestClose = requestClose
    if (internal.phase === 'draining') {
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
        const index = internal.registrations.lastIndexOf(requestClose)
        if (index !== -1) internal.registrations.splice(index, 1)
        internal.openCount = internal.registrations.length
        internal.currentRequestClose = internal.registrations.at(-1) ?? null
        if (internal.guard && internal.phase === null && internal.currentRequestClose) {
            internal.guard = { ...internal.guard, requestClose: internal.currentRequestClose }
        }
        if (internal.phase === 'draining') {
            internal.pendingRearmRequestClose = internal.currentRequestClose
        }
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
    const previousIdx = internal.lastSeenIdx
    internal.lastSeenIdx = state?.idx

    if (!guard) {
        if (internal.retiredBouncePending) {
            internal.retiredBouncePending = false
            if (!marker && (state?.key ?? undefined) === internal.retiredBaseKey) {
                ;(event as PopStateEvent).stopImmediatePropagation()
                return
            }
        }
        if (markerMatches(marker, internal.retiredMarker)) {
            // Landed on a retired guard marker: bounce back with go(-1). From the base this is a
            // Forward with delta 0, never a real page, so history@5 must not hear it (REQ-006).
            // From an entry pushed past the guard (ASMA-8894) it is a real Back: history@5 still
            // holds that entry, so this hop has to reach it; the bounce onto the base then lands
            // on the same key and index history@5 just read, and is suppressed as usual.
            const cameFromAhead =
                typeof previousIdx === 'number' && typeof state?.idx === 'number' && previousIdx > state.idx
            if (!cameFromAhead) {
                ;(event as PopStateEvent).stopImmediatePropagation()
            }
            internal.retiredBouncePending = true
            try {
                win.history.go(-1)
            } catch {
                internal.retiredBouncePending = false
                /* fail open: leave the stray marker in place */
            }
            return
        }
        internal.lastPopstateAt = Date.now()
        return
    }

    const landedOnGuard = markerMatches(marker, guard.marker)
    const landedOnBase = !landedOnGuard && (state?.key ?? undefined) === guard.baseKey

    if (internal.phase === 'rearming') {
        if (landedOnGuard) {
            ;(event as PopStateEvent).stopImmediatePropagation()
            internal.phase = null
            if (internal.openCount === 0) {
                drain(win, internal)
                return
            }
            if (internal.disablePending || !internal.public.enabled) {
                internal.disablePending = false
                drain(win, internal)
                return
            }
            if (internal.pendingNav) requestCloseForPendingNavigation(win, internal, guard)
            else void guard.requestClose()
            return
        }
        internal.lastPopstateAt = Date.now()
        internal.retiredMarker = guard.marker
        internal.retiredBaseKey = guard.baseKey
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
        internal.lastPopstateAt = Date.now()
        internal.retiredMarker = guard.marker
        internal.retiredBaseKey = guard.baseKey
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
    internal.lastPopstateAt = Date.now()
    internal.retiredMarker = guard.marker
    internal.retiredBaseKey = guard.baseKey
    internal.guard = null
    internal.phase = null
    void guard.requestClose()
}

function pathOf(to: To, fallback: string): string {
    if (typeof to === 'string') {
        return to.split(/[?#]/, 1)[0] || fallback
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
    internal.lastSeenIdx = readState(win)?.idx

    const recordTrustedGesture = (event: Event) => {
        if (event.isTrusted) {
            internal.lastGestureAt = Date.now()
        }
    }
    win.addEventListener('click', recordTrustedGesture, { capture: true })
    win.addEventListener('touchend', recordTrustedGesture, { capture: true })
    win.addEventListener('pointerup', recordTrustedGesture, { capture: true })
    win.addEventListener(
        'keydown',
        (event) => {
            if ((event as KeyboardEvent).key !== 'Escape') {
                recordTrustedGesture(event)
            }
        },
        { capture: true },
    )

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

/** Wraps `push`/`replace` on the real history instance. Must run after `createBrowserHistory()`
 *  returns, since it wraps that instance's methods. Idempotent. `block` is left untouched: the
 *  suppression predicate already keeps owned hops from ever reaching history@5's own blocker
 *  check (TEST-002), and a deferred push/replace runs through the real, unwrapped `push`/`replace`
 *  so a live blocker evaluates it normally (TEST-003) — there is nothing left for a `block` wrap
 *  to do. */
export function finishOverlayBackInstall(win: Window, history: History): void {
    const internal = getOrCreateInternal(win)
    if (internal.historyWrapped) {
        return
    }
    internal.historyWrapped = true

    const originalPush = history.push.bind(history)
    const originalReplace = history.replace.bind(history)
    internal.originalPush = originalPush
    internal.originalReplace = originalReplace

    const navigateUnguarded = (navigate: () => void): void => {
        navigate()
        internal.lastSeenIdx = readState(win)?.idx
    }

    history.push = (to: To, state?: unknown) => {
        const guard = internal.guard
        if (!guard || internal.phase === 'draining') {
            navigateUnguarded(() => originalPush(to, state))
            return
        }
        if (internal.phase === null && !internal.pendingNav && guardEntryAbandoned(win, guard)) {
            retireAbandonedGuard(win, internal)
            navigateUnguarded(() => originalPush(to, state))
            return
        }
        if (internal.pendingNav) {
            console.error('[overlayBack] a navigation is already pending; dropping the conflicting push')
            return
        }
        internal.pendingNav = { kind: 'PUSH', to, state }
        if (internal.phase === null) requestCloseForPendingNavigation(win, internal, guard)
    }

    history.replace = (to: To, state?: unknown) => {
        const guard = internal.guard
        if (!guard || internal.phase === 'draining') {
            navigateUnguarded(() => originalReplace(to, state))
            return
        }
        if (internal.phase === null && !internal.pendingNav && guardEntryAbandoned(win, guard)) {
            // The entry being replaced is not the guard, so the marker must not be re-merged onto it.
            retireAbandonedGuard(win, internal)
            navigateUnguarded(() => originalReplace(to, state))
            return
        }
        if (internal.phase === null && pathOf(to, history.location.pathname) === history.location.pathname) {
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
        if (internal.phase === null) requestCloseForPendingNavigation(win, internal, guard)
    }
}

/** Test-only introspection of the window-singleton state. The returned object is the live state
 *  (not a copy), so a test may also mutate `lastGestureAt`/`lastPopstateAt` to simulate the arming
 *  gate, since jsdom cannot dispatch a genuinely trusted gesture event. Never import this outside
 *  tests. */
export function __inspectOverlayBackForTests__(win: Window): OverlayBackInternalState | undefined {
    return win.__ASMA_OVERLAY_BACK_INTERNAL__
}
