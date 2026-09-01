export type HistoryLocation = { pathname: string; search: string }
export type HistoryTo = { pathname: string; search?: string }
export type HistoryLike = {
    location: HistoryLocation
    push: (to: HistoryTo, state?: unknown) => void
    replace: (to: HistoryTo, state?: unknown) => void
}

export type SectionPathConfig<TTab extends string> = {
    /** Section root without a leading slash — pass a `ProtectedRoutesPaths` value. */
    base: string
    /** Every tab slug the section can render. */
    tabs: readonly TTab[]
    /** Used as the tab for `build`/`goToTab`/`replaceTab` when none is given. */
    defaultTab: TTab
    /** Search params that address a DETAIL view inside this section; stripped by every
     *  navigation this module performs, so returning to a tab never re-opens a detail. */
    detailParams?: readonly string[]
    /** The shared shell history singleton in real usage (`history` from `asma-core-helpers`'s
     *  `g-definitions`), or a fake in tests. Required and explicit so this module stays free of
     *  any browser-global dependency and is testable under plain Node. */
    history: HistoryLike
}

export type SectionPath<TTab extends string> = {
    readonly root: string
    build: (tab?: TTab) => string
    /** `undefined` when the pathname is outside the section (so a widget mounted elsewhere
     *  never canonicalises the URL). `{ tab: undefined }` at the bare section root. */
    parse: (pathname: string) => { tab?: TTab } | undefined
    isTab: (value: unknown) => value is TTab
    goToTab: (tab?: TTab, state?: unknown) => void
    replaceTab: (tab?: TTab, state?: unknown) => void
    /** Current search minus `detailParams`; '' or '?a=b'. */
    searchWithoutDetail: () => string
}

export function createSectionPath<TTab extends string>(config: SectionPathConfig<TTab>): SectionPath<TTab> {
    const { base, tabs, defaultTab, detailParams = [], history } = config
    const root = `/${base}`
    const prefix = `${root}/`

    const isTab = (value: unknown): value is TTab => typeof value === 'string' && (tabs as readonly string[]).includes(value)

    const parse = (pathname: string): { tab?: TTab } | undefined => {
        if (pathname === root) return {}
        if (!pathname.startsWith(prefix)) return undefined
        const [tabSegment] = pathname.slice(prefix.length).split('/')
        return { tab: isTab(tabSegment) ? tabSegment : undefined }
    }

    const build = (tab: TTab = defaultTab): string => `${root}/${tab}`

    const searchWithoutDetail = (): string => stripSearchParams(history.location.search, detailParams)

    const goToTab = (tab: TTab = defaultTab, state?: unknown): void => {
        history.push({ pathname: build(tab), search: searchWithoutDetail() }, state)
    }
    const replaceTab = (tab: TTab = defaultTab, state?: unknown): void => {
        history.replace({ pathname: build(tab), search: searchWithoutDetail() }, state)
    }

    return { root, build, parse, isTab, goToTab, replaceTab, searchWithoutDetail }
}

/** `/base/:detailId/:tab?` — a list at the root, tabs under a detail id. */
export type DetailPathConfig<TTab extends string> = SectionPathConfig<TTab> & {
    isDetailId: (segment: string) => boolean
}

export type DetailPath<TTab extends string> = {
    readonly listPath: string
    build: (detailId: string, tab?: TTab) => string
    /** `undefined` when the pathname is outside the section. `{}` at the bare list path or an
     *  unrecognised id segment (both render the list). */
    parse: (pathname: string) => { detailId?: string; tab?: TTab } | undefined
    isTab: (value: unknown) => value is TTab
    goToList: (state?: unknown) => void
    goToDetail: (detailId: string, tab?: TTab, state?: unknown) => void
    replaceDetail: (detailId: string, tab?: TTab, state?: unknown) => void
    searchWithoutDetail: () => string
}

export function createDetailPath<TTab extends string>(config: DetailPathConfig<TTab>): DetailPath<TTab> {
    const { base, tabs, defaultTab, detailParams = [], isDetailId, history } = config
    const root = `/${base}`
    const prefix = `${root}/`

    const isTab = (value: unknown): value is TTab => typeof value === 'string' && (tabs as readonly string[]).includes(value)

    const parse = (pathname: string): { detailId?: string; tab?: TTab } | undefined => {
        if (pathname === root) return {}
        if (!pathname.startsWith(prefix)) return undefined
        const [idSegment, tabSegment] = pathname.slice(prefix.length).split('/')
        if (!idSegment || !isDetailId(idSegment)) return {}
        return { detailId: idSegment, tab: isTab(tabSegment) ? tabSegment : undefined }
    }

    const build = (detailId: string, tab: TTab = defaultTab): string => `${root}/${detailId}/${tab}`

    const searchWithoutDetail = (): string => stripSearchParams(history.location.search, detailParams)

    const goToList = (state?: unknown): void => {
        history.push({ pathname: root, search: searchWithoutDetail() }, state)
    }
    const goToDetail = (detailId: string, tab: TTab = defaultTab, state?: unknown): void => {
        history.push({ pathname: build(detailId, tab), search: searchWithoutDetail() }, state)
    }
    const replaceDetail = (detailId: string, tab: TTab = defaultTab, state?: unknown): void => {
        history.replace({ pathname: build(detailId, tab), search: searchWithoutDetail() }, state)
    }

    return { listPath: root, build, parse, isTab, goToList, goToDetail, replaceDetail, searchWithoutDetail }
}

function stripSearchParams(search: string, names: readonly string[]): string {
    if (!names.length) return search
    const params = new URLSearchParams(search)
    let changed = false
    for (const name of names) {
        if (params.has(name)) {
            params.delete(name)
            changed = true
        }
    }
    if (!changed) return search
    const next = params.toString()
    return next ? `?${next}` : ''
}
