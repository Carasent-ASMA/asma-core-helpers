import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createDetailPath, createSectionPath, type HistoryLike } from './sectionPath.helpers.js'

type Tab = 'info' | 'users' | 'employees'
const TABS: readonly Tab[] = ['info', 'users', 'employees']

function fakeHistory(pathname: string, search = ''): HistoryLike & { calls: Array<{ method: string; to: unknown; state: unknown }> } {
    const calls: Array<{ method: string; to: unknown; state: unknown }> = []
    return {
        location: { pathname, search },
        push: (to, state) => calls.push({ method: 'push', to, state }),
        replace: (to, state) => calls.push({ method: 'replace', to, state }),
        calls,
    }
}

describe('createSectionPath', () => {
    it('parses the bare root as the default (no) tab', () => {
        const section = createSectionPath({ base: 'reports/time-tracking-list', tabs: TABS, defaultTab: 'info', history: fakeHistory('/') })
        assert.deepEqual(section.parse('/reports/time-tracking-list'), {})
    })

    it('parses a known tab segment', () => {
        const section = createSectionPath({ base: 'reports/time-tracking-list', tabs: TABS, defaultTab: 'info', history: fakeHistory('/') })
        assert.deepEqual(section.parse('/reports/time-tracking-list/users'), { tab: 'users' })
    })

    it('treats an unknown tab segment as no tab', () => {
        const section = createSectionPath({ base: 'reports/time-tracking-list', tabs: TABS, defaultTab: 'info', history: fakeHistory('/') })
        assert.deepEqual(section.parse('/reports/time-tracking-list/bogus'), { tab: undefined })
    })

    it('returns undefined outside the section, so an embedded widget never rewrites the URL', () => {
        const section = createSectionPath({ base: 'reports/time-tracking-list', tabs: TABS, defaultTab: 'info', history: fakeHistory('/') })
        assert.equal(section.parse('/overview'), undefined)
        assert.equal(section.parse('/reports/time-tracking-list-team-leader'), undefined)
    })

    it('builds a tab path, defaulting to defaultTab', () => {
        const section = createSectionPath({ base: 'tasks', tabs: TABS, defaultTab: 'info', history: fakeHistory('/') })
        assert.equal(section.build('users'), '/tasks/users')
        assert.equal(section.build(), '/tasks/info')
    })

    it('goToTab pushes the tab path with detail params stripped from the current search', () => {
        const history = fakeHistory('/tasks/info', '?task_id=42&keep=me')
        const section = createSectionPath({
            base: 'tasks',
            tabs: TABS,
            defaultTab: 'info',
            detailParams: ['task_id'],
            history,
        })
        section.goToTab('users')
        assert.deepEqual(history.calls, [{ method: 'push', to: { pathname: '/tasks/users', search: '?keep=me' }, state: undefined }])
    })

    it('replaceTab issues a replace, not a push', () => {
        const history = fakeHistory('/tasks/info')
        const section = createSectionPath({ base: 'tasks', tabs: TABS, defaultTab: 'info', history })
        section.replaceTab('employees')
        assert.equal(history.calls[0]?.method, 'replace')
    })

    it('forwards a navigation-guard state marker verbatim', () => {
        const history = fakeHistory('/tasks/info')
        const section = createSectionPath({ base: 'tasks', tabs: TABS, defaultTab: 'info', history })
        section.goToTab('users', 'asma:tab-switch-guarded')
        assert.equal(history.calls[0]?.state, 'asma:tab-switch-guarded')
    })

    it('searchWithoutDetail is a no-op when nothing to strip', () => {
        const history = fakeHistory('/tasks/info', '?keep=me')
        const section = createSectionPath({ base: 'tasks', tabs: TABS, defaultTab: 'info', detailParams: ['task_id'], history })
        assert.equal(section.searchWithoutDetail(), '?keep=me')
    })
})

describe('createDetailPath', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111'

    function customersPath(history: HistoryLike = fakeHistory('/')) {
        return createDetailPath({
            base: 'admin-panel/customers',
            tabs: TABS,
            defaultTab: 'info',
            isDetailId: (segment) => UUID_REGEX.test(segment),
            history,
        })
    }

    it('parses the bare root as the list (no detail)', () => {
        assert.deepEqual(customersPath().parse('/admin-panel/customers'), {})
    })

    it('treats a non-UUID first segment as the list, not a detail id', () => {
        assert.deepEqual(customersPath().parse('/admin-panel/customers/not-a-uuid'), {})
    })

    it('parses a detail id with no tab', () => {
        assert.deepEqual(customersPath().parse(`/admin-panel/customers/${CUSTOMER_ID}`), {
            detailId: CUSTOMER_ID,
            tab: undefined,
        })
    })

    it('parses a detail id with a known tab', () => {
        assert.deepEqual(customersPath().parse(`/admin-panel/customers/${CUSTOMER_ID}/employees`), {
            detailId: CUSTOMER_ID,
            tab: 'employees',
        })
    })

    it('returns undefined outside the section', () => {
        assert.equal(customersPath().parse('/admin-panel/designer-overview'), undefined)
    })

    it('builds a detail path, defaulting the tab', () => {
        const path = customersPath()
        assert.equal(path.build(CUSTOMER_ID), `/admin-panel/customers/${CUSTOMER_ID}/info`)
        assert.equal(path.build(CUSTOMER_ID, 'employees'), `/admin-panel/customers/${CUSTOMER_ID}/employees`)
    })

    it('goToList pushes the bare root with detail params stripped', () => {
        const history = fakeHistory(`/admin-panel/customers/${CUSTOMER_ID}/info`, '?tekst_grp_nr=9&keep=me')
        const path = createDetailPath({
            base: 'admin-panel/customers',
            tabs: TABS,
            defaultTab: 'info',
            isDetailId: (segment) => UUID_REGEX.test(segment),
            detailParams: ['tekst_grp_nr'],
            history,
        })
        path.goToList()
        assert.deepEqual(history.calls, [
            { method: 'push', to: { pathname: '/admin-panel/customers', search: '?keep=me' }, state: undefined },
        ])
    })

    it('goToDetail and replaceDetail push/replace the same shape', () => {
        const history = fakeHistory('/admin-panel/customers')
        const path = createDetailPath({
            base: 'admin-panel/customers',
            tabs: TABS,
            defaultTab: 'info',
            isDetailId: (segment) => UUID_REGEX.test(segment),
            history,
        })
        path.goToDetail(CUSTOMER_ID, 'users')
        path.replaceDetail(CUSTOMER_ID, 'employees')
        assert.deepEqual(history.calls, [
            { method: 'push', to: { pathname: `/admin-panel/customers/${CUSTOMER_ID}/users`, search: '' }, state: undefined },
            { method: 'replace', to: { pathname: `/admin-panel/customers/${CUSTOMER_ID}/employees`, search: '' }, state: undefined },
        ])
    })
})
