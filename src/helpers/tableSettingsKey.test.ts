import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'

import { JSDOM } from 'jsdom'

// The helper pulls in the shell bindings and `g-definitions`, and importing them loads the whole barrel, which
// reads `window` and `localStorage` at import time. A jsdom window is installed as the global first and the
// modules are imported dynamically afterwards, like `generateEnvConfigsBindings.test.ts` does. The real event
// bus and the real shared `history` are used, so the subscription tests exercise the actual wiring.
const dom = new JSDOM('', { url: 'https://dev.adopus.no/users?user_context=ME', pretendToBeVisual: true })
const GLOBAL_NAMES = ['window', 'document', 'localStorage', 'location'] as const

type Metadata = { user_id?: unknown; customer_id?: unknown }
type Shell = { auth_bindings?: { getMetadata: () => Metadata | undefined } }

const USER = '0b1c8f9e-1111-4111-8111-111111111111'
const OTHER_USER = '0b1c8f9e-2222-4222-8222-222222222222'
const TENANT = '7d3a5c10-3333-4333-8333-333333333333'
const OTHER_TENANT = '7d3a5c10-4444-4444-8444-444444444444'
const PILOT_ID = 'directory.my-participants'

let helper: typeof import('./tableSettingsKey.ts')
let authBindings: typeof import('./generateSrvAuthBindings.ts')
let definitions: typeof import('../g-definitions.ts')
let urlParams: typeof import('./urlParams.helpers.tsx')
let originalShell: Shell

const win = () => dom.window as unknown as { __ASMA__SHELL__?: Shell }

function setMetadata(metadata: Metadata | undefined) {
    originalShell.auth_bindings = { getMetadata: () => metadata }
}

function signedIn(overrides: Metadata = {}) {
    setMetadata({ user_id: USER, customer_id: TENANT, ...overrides })
}

/** Verbatim format of asma-app-directory `src/helpers/generateUniqKey.ts` at 677b3bca, with its three inputs
 *  (user id, tenant id and `getUserContextParam()`) passed in. */
const appDirectoryGenerateUniqKey = (key: string, userId: string, customerId: string, context: string) =>
    `${key}_${userId}_${customerId}_${context}`

/** The snapshot function P3 gives `useSyncExternalStore`: it re-reads `user_context` itself on every call. */
function pilotSnapshot() {
    const param: unknown = urlParams.getParamByName('user_context' as never)
    return helper.getTableSettingsKey(PILOT_ID, { context: typeof param === 'string' ? param : '' })
}

function countCalls() {
    const state = { calls: 0 }
    const unsubscribe = helper.onTableSettingsKeyChange(() => {
        state.calls += 1
    })
    return { state, unsubscribe }
}

before(async () => {
    const globals = globalThis as Record<string, unknown>
    for (const name of GLOBAL_NAMES) {
        Object.defineProperty(globals, name, {
            value: (dom.window as unknown as Record<string, unknown>)[name],
            configurable: true,
            writable: true,
        })
    }

    helper = await import('./tableSettingsKey.ts')
    authBindings = await import('./generateSrvAuthBindings.ts')
    definitions = await import('../g-definitions.ts')
    urlParams = await import('./urlParams.helpers.tsx')

    originalShell = win().__ASMA__SHELL__ as Shell
})

afterEach(() => {
    win().__ASMA__SHELL__ = originalShell
    delete originalShell.auth_bindings
    definitions.history.replace('/users?user_context=ME')
})

after(() => {
    for (const name of GLOBAL_NAMES) {
        delete (globalThis as Record<string, unknown>)[name]
    }
})

describe('getTableSettingsKey', () => {
    it('U-G01: both ids known → ${tableId}_${userId}_${customerId}_${context}', () => {
        signedIn()

        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), `${PILOT_ID}_${USER}_${TENANT}_ME`)
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'RECIPIENT' }), `${PILOT_ID}_${USER}_${TENANT}_RECIPIENT`)
        assert.equal(helper.getTableSettingsKey(PILOT_ID), `${PILOT_ID}_${USER}_${TENANT}_`)
        assert.equal(helper.getTableSettingsKey(PILOT_ID, {}), `${PILOT_ID}_${USER}_${TENANT}_`)
    })

    it('U-G02: user id missing or empty → undefined', () => {
        signedIn({ user_id: undefined })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        signedIn({ user_id: '' })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        signedIn({ user_id: null })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        setMetadata({ customer_id: TENANT })
        assert.equal(helper.getTableSettingsKey(PILOT_ID), undefined)
    })

    it('U-G03: tenant missing or empty → undefined', () => {
        signedIn({ customer_id: undefined })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        signedIn({ customer_id: '' })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        signedIn({ customer_id: null })
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        setMetadata({ user_id: USER })
        assert.equal(helper.getTableSettingsKey(PILOT_ID), undefined)
    })

    it('U-G04: no auth bindings on the window → undefined, no throw', () => {
        // The shell object exists but has no bindings yet.
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        // The bindings exist, but the srvAuth response has not carried metadata yet.
        setMetadata(undefined)
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        // No shell object at all.
        win().__ASMA__SHELL__ = undefined
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        // A binding that throws, and a binding without `getMetadata`.
        win().__ASMA__SHELL__ = {
            auth_bindings: {
                getMetadata: () => {
                    throw new Error('bindings are not ready')
                },
            },
        }
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)

        win().__ASMA__SHELL__ = { auth_bindings: {} as never }
        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME' }), undefined)
    })

    it("U-G05: context outside [A-Za-z0-9-]{0,32} → ''", () => {
        signedIn()
        const emptyContextKey = `${PILOT_ID}_${USER}_${TENANT}_`
        const rejected: unknown[] = [
            'free text',
            'ME,RECIPIENT',
            'ME_RECIPIENT',
            'user_context=ME',
            '?user_context=ME&lang=no',
            'ME\n',
            'ÆØÅ',
            'x'.repeat(33),
            ['ME'],
            ['ME', 'RECIPIENT'],
            42,
            null,
            undefined,
            '',
        ]

        for (const context of rejected) {
            assert.equal(
                helper.getTableSettingsKey(PILOT_ID, { context: context as string }),
                emptyContextKey,
                `context ${JSON.stringify(context)} must become ''`,
            )
        }

        assert.equal(helper.getTableSettingsKey(PILOT_ID, { context: 'ME-2' }), `${PILOT_ID}_${USER}_${TENANT}_ME-2`)
        assert.equal(
            helper.getTableSettingsKey(PILOT_ID, { context: 'x'.repeat(32) }),
            `${PILOT_ID}_${USER}_${TENANT}_${'x'.repeat(32)}`,
        )
    })

    it('U-G06: table ids with spaces, ":", "/", non-ASCII or over 100 characters → undefined', () => {
        signedIn()
        const rejected: unknown[] = [
            'my table',
            'a:b',
            'a/b',
            'Tabell æøå',
            'Столбец',
            'a'.repeat(101),
            '',
            '.hidden',
            '-dash',
            '_underscore',
            'a\n',
            null,
            42,
        ]

        for (const tableId of rejected) {
            assert.equal(
                helper.getTableSettingsKey(tableId as string, { context: 'ME' }),
                undefined,
                `table id ${JSON.stringify(tableId)} must be rejected`,
            )
        }

        assert.equal(helper.getTableSettingsKey('a'.repeat(100)), `${'a'.repeat(100)}_${USER}_${TENANT}_`)
    })

    it('U-G07: directory.my-participants and legacy UsersTable are accepted', () => {
        signedIn()

        assert.equal(helper.getTableSettingsKey('directory.my-participants'), `directory.my-participants_${USER}_${TENANT}_`)
        assert.equal(helper.getTableSettingsKey('UsersTable'), `UsersTable_${USER}_${TENANT}_`)
        assert.equal(helper.getTableSettingsKey('mvLogsTableKey'), `mvLogsTableKey_${USER}_${TENANT}_`)
    })

    it('U-G08: output equals asma-app-directory generateUniqKey for the same metadata and context', () => {
        signedIn()

        for (const context of ['ME', 'RECIPIENT', '']) {
            for (const tableId of [PILOT_ID, 'UsersTable']) {
                assert.equal(
                    helper.getTableSettingsKey(tableId, { context }),
                    appDirectoryGenerateUniqKey(tableId, USER, TENANT, context),
                )
            }
        }
    })

    it('U-G09: two table ids give different keys for the same user (AC 6)', () => {
        signedIn()

        const first = helper.getTableSettingsKey('directory.my-participants', { context: 'ME' })
        const second = helper.getTableSettingsKey('directory.all-participants', { context: 'ME' })

        assert.ok(first && second)
        assert.notEqual(first, second)
    })

    it('U-G10: two users or two tenants give different keys for the same table (AC 5)', () => {
        signedIn()
        const base = helper.getTableSettingsKey(PILOT_ID, { context: 'ME' })

        signedIn({ user_id: OTHER_USER })
        const otherUser = helper.getTableSettingsKey(PILOT_ID, { context: 'ME' })

        signedIn({ customer_id: OTHER_TENANT })
        const otherTenant = helper.getTableSettingsKey(PILOT_ID, { context: 'ME' })

        assert.ok(base && otherUser && otherTenant)
        assert.equal(new Set([base, otherUser, otherTenant]).size, 3)
    })
})

describe('onTableSettingsKeyChange', () => {
    it('U-G11: calls the listener on jwt_changed and logout_event, and not on subscribe', () => {
        const { state, unsubscribe } = countCalls()

        try {
            assert.equal(state.calls, 0)

            authBindings.dispatchSrvAuthEvents('jwt_changed', undefined, false)
            assert.equal(state.calls, 1)

            authBindings.dispatchSrvAuthEvents('logout_event', {}, false)
            assert.equal(state.calls, 2)
        } finally {
            unsubscribe()
        }
    })

    it('U-G12: the unsubscribe function stops further calls from all three sources', () => {
        const stays = countCalls()
        const leaves = countCalls()

        try {
            authBindings.dispatchSrvAuthEvents('jwt_changed', undefined, false)
            authBindings.dispatchSrvAuthEvents('logout_event', {}, false)
            definitions.history.push('/users?user_context=RECIPIENT')
            assert.equal(leaves.state.calls, 3, 'each of the three sources reaches a live listener')

            leaves.unsubscribe()

            authBindings.dispatchSrvAuthEvents('jwt_changed', undefined, false)
            authBindings.dispatchSrvAuthEvents('logout_event', {}, false)
            definitions.history.push('/users?user_context=ME')
            assert.equal(leaves.state.calls, 3, 'no call after unsubscribe')
            assert.equal(stays.state.calls, 6, 'another subscriber is unaffected')
        } finally {
            leaves.unsubscribe()
            stays.unsubscribe()
        }
    })

    it('U-G13: a context-only change fires the listener with no jwt or logout event (R1-01)', () => {
        signedIn()
        definitions.history.replace('/users?user_context=ME')
        const { state, unsubscribe } = countCalls()

        try {
            assert.equal(pilotSnapshot(), `${PILOT_ID}_${USER}_${TENANT}_ME`)

            definitions.history.push('/users?user_context=RECIPIENT')

            assert.equal(state.calls, 1)
            assert.equal(pilotSnapshot(), `${PILOT_ID}_${USER}_${TENANT}_RECIPIENT`)
            // The helper itself never reads the URL: without the `context` argument the segment stays empty.
            assert.equal(helper.getTableSettingsKey(PILOT_ID), `${PILOT_ID}_${USER}_${TENANT}_`)
        } finally {
            unsubscribe()
        }
    })

    it('U-G14: a history change that leaves user_context alone fires the listener but not the key (R2-02)', () => {
        signedIn()
        definitions.history.replace('/users?user_context=ME')
        const { state, unsubscribe } = countCalls()

        try {
            const before = pilotSnapshot()

            definitions.history.push('/users?user_context=ME&lang=no')

            const after = pilotSnapshot()
            assert.equal(state.calls, 1)
            assert.equal(before, `${PILOT_ID}_${USER}_${TENANT}_ME`)
            assert.equal(after, `${PILOT_ID}_${USER}_${TENANT}_ME`)
            assert.ok(Object.is(before, after), 'useSyncExternalStore sees no key change')
        } finally {
            unsubscribe()
        }
    })
})
