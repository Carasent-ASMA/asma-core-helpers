import { asmaOverridesEventBus, EventBus } from 'asma-event-bus'
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings.js'
import { realWindow } from './getSubdomain.js'
import { getInjectedPlatform } from './getDefaultAppVersions.js'
import { get as _ } from 'idb-keyval'
import type { ICheckSigninOptions, ICheckSigninTransformedOptions, GenerateSrvAuthBindingsOptions } from './generateSrvAuthBindings.types.js'
import { domain } from './initEnvConfigsVars.js'
import type { ActivityStatus } from './getActivityStatus.js'
import type { IAuthBindings } from '../g-definitions.js'
import type { IBaseJwtClaims, IUUID } from 'asma-types'
import { ActivityStatuses, getActivityStatus } from './getActivityStatus.js'
import { SharedContextError } from '../context/createSharedContext.js'
import type { SharedContextController, SharedContextLease, SharedContextOwnerClientSource } from '../context/context.types.js'

const managedAuthContexts = new WeakMap<object, (context: SharedContextController) => void>()

//let logoutSuccessful = false

export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus<{
    jwt_changed?: ICheckSigninOptions<any> //IBaseJwtClaims<'super_user' | 'therapist' | 'recipient'>
    logout_event: { device?: 'TRUSTED' | 'UNTRUSTED' }
    customer_changed: {}
}>('auth-bindings')

function dispatchLogoutEvent(device?: 'TRUSTED' | 'UNTRUSTED') {
    dispatchSrvAuthEvents('logout_event', { device }, false)
}
function dispatchJwtChangedEvent(jwt?: ICheckSigninOptions<any>) {
    dispatchSrvAuthEvents('jwt_changed', jwt, false)
}
/**
 * @generic FeatureEnums - feature_names_enums from directory introspection
 * @generic SrvUrlsEnums - srv_names_enums from directory introspection
 */
//type EnvConfigsFn = () => { SRV_AUTH: string; DEVELOPMENT: boolean; ENVIRONMENT_TO_OPERATE: string }

export async function getCachedJwtInternal() {
    const getCachedJwt = realWindow.__ASMA__SHELL__?.auth_bindings?.getCachedJwt

    if (!getCachedJwt) {
        throw new Error(
            'getCachedJwt is not defined! please make sure that generateSrvAuthBindings is called before getCachedJwt',
        )
    }
    return getCachedJwt()
}

export function getJwtTokenInternal(): string | undefined {
    const getJwtToken = realWindow.__ASMA__SHELL__?.auth_bindings?.getJwtToken

    if (!getJwtToken) {
        throw new Error(
            'getJwtToken is not defined! please make sure that generateSrvAuthBindings is called before getJwtToken',
        )
    }
    return getJwtToken()
}
export async function checkForRegisteredSubdomainInternal() {
    const checkForRegisteredSubdomain = realWindow.__ASMA__SHELL__?.auth_bindings?.checkForRegisteredSubdomain

    if (!checkForRegisteredSubdomain) {
        throw new Error(
            'checkForRegisteredSubdomain is not defined! please make sure that generateSrvAuthBindings is called before checkForRegisteredSubdomain',
        )
    }
    return checkForRegisteredSubdomain()
}
export function getConnectorInternal() {
    const getConnector = realWindow.__ASMA__SHELL__?.auth_bindings?.getConnector

    if (!getConnector) {
        throw new Error(
            'getCachedJwt is not defined! please make sure that generateSrvAuthBindings is called before getCachedJwt',
        )
    }
    return getConnector()
}

export function isJwtValidInternal(): boolean {
    const isJwtValid = realWindow.__ASMA__SHELL__?.auth_bindings?.isJwtValid

    if (!isJwtValid) {
        throw new Error(
            'srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet',
        )
    }
    return isJwtValid()
}

export async function srvAuthGetInternal<R>(url: string | URL, headers?: Record<string, string>) {
    const srvAuthGet = realWindow.__ASMA__SHELL__?.auth_bindings?.srvAuthGet

    if (!srvAuthGet) {
        throw new Error(
            'srvAuthGet is not defined! please make sure that generateSrvAuthBindings is called before srvAuthGet',
        )
    }
    return srvAuthGet<R>(url, headers)
}

export function getSrvUrlsInternal(): Record<'ao_wrapper' | 'connector', string> | undefined {
    const getSrvUrls = realWindow.__ASMA__SHELL__?.auth_bindings?.getSrvUrls
    if (!getSrvUrls) {
        throw new Error(
            'getSrvUrls is not defined! please make sure that generateSrvAuthBindings is called before getSrvUrls',
        )
    }
    return getSrvUrls()
}

export async function setReqConfigInternal<T = unknown>(
    data?: T | undefined,
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream',
) {
    const setReqConfig = realWindow.__ASMA__SHELL__?.auth_bindings?.setReqConfig
    if (!setReqConfig) {
        throw new Error(
            'setReqConfig is not defined! please make sure that generateSrvAuthBindings is called before setReqConfig',
        )
    }
    return setReqConfig(data, responseType)
}

export function getThemeInternal() {
    const getTheme = realWindow.__ASMA__SHELL__?.auth_bindings?.getTheme
    if (!getTheme) {
        throw new Error(
            'getTheme is not defined! please make sure that generateSrvAuthBindings is called before getTheme',
        )
    }
    return getTheme()
}
export type IOpenReplay = {
    enable: boolean
    live_assist: boolean
    graphql: boolean
    mobx: boolean
    profiler: boolean
    advoca: boolean
}

export type ISigninResponse<FE extends string> = {
    message: 'Success'
    token: string
    metadata?: ICheckSigninOptions<FE>
}
export type ICheckRegisteredSubdomainResponse<FE extends string> = {
    metadata: ICheckSigninOptions<FE>
    message: 'Success'
    token?: string
}

export function generateSrvAuthBindings<FE extends string>(logout?: () => void, options: GenerateSrvAuthBindingsOptions = {}) {
    if (realWindow.__ASMA__SHELL__?.auth_bindings) {
        if (options.sharedContext) {
            const attach = managedAuthContexts.get(realWindow.__ASMA__SHELL__.auth_bindings)
            if (!attach) throw new SharedContextError('owner_unavailable')
            attach(options.sharedContext)
        }
        if (logout) registerCallbackOnSrvAuthEvents('logout_event', logout)
        return realWindow.__ASMA__SHELL__.auth_bindings as typeof auth_bindings
    }
    let jwtToken = ''

    let metadata: ICheckSigninTransformedOptions<FE> | undefined
    let requestGeneration = 0
    let expiryTimer: ReturnType<typeof setTimeout> | undefined
    const contexts = new Set<SharedContextController>()
    const promiseRegistry = new Map<string, Promise<unknown>>()
    type CachedActivityStatus = { value: ActivityStatus; expiresAt: number }
    const CACHE_TTL = 1000 * 60 * 5
    const activityStatusesCached = new Map<string, CachedActivityStatus>()
    const pendingRequests = new Map<string, Promise<Map<string, ActivityStatus>>>()
    let activityGeneration = 0

    function invalidateRequests() {
        ++requestGeneration
        ++activityGeneration
        promiseRegistry.clear()
        activityStatusesCached.clear()
        pendingRequests.clear()
    }

    function assertRequestCurrent(captured: number) {
        if (captured !== requestGeneration) throw new SharedContextError('stale_context')
    }

    function attachContext(context: SharedContextController) {
        if (contexts.has(context)) return
        let observed = context.getSnapshot().generation
        let disposed = false
        let unsubscribe: (() => void) | undefined
        unsubscribe = context.subscribe(snapshot => {
            if (snapshot.generation !== observed) {
                observed = snapshot.generation
                invalidateRequests()
            }
            if (snapshot.status === 'disposed') {
                disposed = true
                contexts.delete(context)
                unsubscribe?.()
            }
        })
        // Retain only a successful subscription, including synchronous disposal callbacks.
        if (disposed) { unsubscribe(); return }
        contexts.add(context)
        invalidateRequests()
    }

    function invalidateContexts(status: 'pending' | 'anonymous' | 'denied') {
        // Do not let one owner's failed cleanup prevent the other contexts from revoking.
        let failed = false
        for (const context of contexts) {
            try { context.invalidate(status) } catch { failed = true }
        }
        if (failed) throw new SharedContextError('cleanup_failed')
    }

    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken

    const isJwtValid = () => !isJwtInvalid()

    async function _handleSrvAuthRequest<R>(url: string | URL, fetchOptions: RequestInit): Promise<R> {
        if (typeof url === 'string') {
            url = buildURL(url)
        }

        const endpoint = url
        const captured = requestGeneration
        // Never coalesce write/ceremony requests. Read keys include query, headers and scope.
        const read = !fetchOptions.method || fetchOptions.method === 'GET'
        const headers = [...new Headers(fetchOptions.headers)].sort(([a], [b]) => a.localeCompare(b))
        const key = JSON.stringify([captured, endpoint.href, headers])
        const existing = read ? promiseRegistry.get(key) : undefined
        if (existing) return existing as Promise<R>
        const request = (async () => {
            const res = await fetch(endpoint.toString(), fetchOptions)
            assertRequestCurrent(captured)
            const responseData = await res.json() as R
            assertRequestCurrent(captured)
            if (!res.ok) throw responseData
            // A failed/late signout must never repopulate credentials or metadata.
            if (!endpoint.pathname.endsWith('/signout')) {
                setAuthData(responseData as Partial<ISigninResponse<FE>>)
                if (typeof responseData === 'object' && responseData !== null && 'default_app_versions' in responseData) {
                    dispatchCustomerUserRelatedAppVersions(responseData.default_app_versions as Record<string, string>)
                }
            }
            return responseData
        })()
        if (read) promiseRegistry.set(key, request)
        try { return await request } finally {
            if (promiseRegistry.get(key) === request) promiseRegistry.delete(key)
        }
    }

    async function srvAuthPost<T = unknown, R = unknown>(
        url: string | URL,
        body: T,
        headers?: Record<string, string>,
    ): Promise<R> {
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
            credentials: 'include',
        }
        return _handleSrvAuthRequest<R>(url, fetchOptions)
    }

    async function editorPost<T = unknown, R = unknown>({
        url,
        body,
        headers,
        signal,
    }: {
        url: string
        body?: T
        headers?: Record<string, string>
        signal?: AbortSignal
    }): Promise<R> {
        const captured = requestGeneration
        const token = await getCachedJwt()
        assertRequestCurrent(captured)
        if (!token || !isJwtValid()) throw new SharedContextError('context_unavailable')
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': metadata?.customer_id ?? '',
                Authorization: `Bearer ${token}`,
                ...headers,
            },
            body: JSON.stringify(body),
            signal,
        }
        const baseURL = EnvConfigsFnInternal().BUNJS_EDITOR
        const response = await fetch(
            new URL(`${baseURL.replace(/\/+$/, '')}${url}`, window.location.origin).toString(),
            fetchOptions,
        )
        assertRequestCurrent(captured)

        if (!response.ok) throw new Error(`Editor request failed with status ${response.status}`)

        const data = await response.json() as R
        assertRequestCurrent(captured)
        return data
    }

    async function srvAuthGet<R>(url: string | URL, headers?: Record<string, string>): Promise<R> {
        //const { ENVIRONMENT_TO_OPERATE, DEVELOPMENT } = EnvConfigsFnInternal()
        const attachedHeaders = attachAdditionalHeaders(headers || {})
        const fetchOptions: RequestInit = {
            headers: {
                ...attachedHeaders,
            },
            credentials: 'include',
        }
        return _handleSrvAuthRequest<R>(url, fetchOptions)
    }

    function accessTokenHasExpired(): boolean {
        const accessTokenExpDate = metadata?.exp || 0

        const nowTime = Math.floor(new Date().getTime() / 1000)

        const expired = accessTokenExpDate - 10 <= nowTime
        if (expired && jwtToken) resetData('denied')
        return expired
    }

    function scheduleAuthExpiry() {
        if (expiryTimer !== undefined) clearTimeout(expiryTimer)
        expiryTimer = undefined
        if (!metadata?.exp || !jwtToken) return
        const delay = Math.max(Math.ceil(metadata.exp - 10) * 1000 - Date.now(), 0)
        expiryTimer = setTimeout(() => {
            expiryTimer = undefined
            if (!accessTokenHasExpired()) scheduleAuthExpiry()
        }, Math.min(delay, 2_147_483_647))
        const processTimer: unknown = expiryTimer
        if (typeof processTimer === 'object' && processTimer !== null && 'unref' in processTimer && typeof processTimer.unref === 'function') processTimer.unref()
    }

    /**
     *
     * TODO: need to investigate smarter way of registering and unregister on `logout_event`
     **/
    registerCallbackOnSrvAuthEvents('logout_event', async ({ device }) => {
        resetData('anonymous')
        const url = buildURL('/signout')
        if (device === 'UNTRUSTED') {
            url.searchParams.append('unset', 'device_authorization_token')
        }
        try { await srvAuthGet(url) } catch {
            // Local revocation precedes the request and remains in force on any failure.
            console.warn('Signout request failed')
        }
    })
    // Local revocation runs before downstream logout observers.
    if (logout) registerCallbackOnSrvAuthEvents('logout_event', logout)

    async function signin(url: string | URL, headers?: Record<string, string>): Promise<ISigninResponse<FE>> {
        const isLegalGuardianPath = url.toString().includes('advoca.lg.change-user')

        if (!isLegalGuardianPath && isJwtValid() && metadata) {
            return {
                token: jwtToken,

                metadata: {
                    ...metadata,
                    features: metadata?.features ? Array.from(metadata.features) : undefined,
                },
                message: 'Success',
            }
        }
        const data = await srvAuthGet<ISigninResponse<FE>>(url, headers)

        return data
    }

    function getUserId() {
        return getMetadata()?.user_id
    }
    function resetData(status: 'anonymous' | 'denied' = 'anonymous') {
        jwtToken = ''
        metadata = undefined
        if (expiryTimer !== undefined) clearTimeout(expiryTimer)
        expiryTimer = undefined
        invalidateRequests()
        invalidateContexts(status)
    }

    function setAuthData(data?: Partial<ISigninResponse<FE>>) {
        if (!data?.metadata && !data?.token) return
        const previousMetadata = metadata
        const previousToken = jwtToken
        // Clear and revoke before exposing a replacement, including same-ID grant changes.
        resetData('denied')
        invalidateContexts('pending')
        const captured = requestGeneration
        if (data?.metadata) {
            metadata = {
                ...data.metadata,
                features: new Set(data.metadata?.features),
                overviews: data.metadata.overviews,
            }
        } else {
            metadata = previousMetadata
        }
        const sameIdentity = previousMetadata?.user_id === metadata?.user_id && previousMetadata?.customer_id === metadata?.customer_id && previousMetadata?.journal === metadata?.journal
        jwtToken = data.token ?? (sameIdentity ? previousToken : '')
        scheduleAuthExpiry()
        if (data.token) {

            dispatchJwtChangedEvent(data.metadata)

            //data.metadata?.theme!== metadata?.theme setTheme(data.metadata.theme)
        }
        assertRequestCurrent(captured)
    }

    function getJwtToken() {
        accessTokenHasExpired()
        return jwtToken
    }

    function getOpenReplay() {
        accessTokenHasExpired()
        if (!metadata?.openreplay) {
            console.warn('openreplay is not defined in metadata')
        }
        return metadata?.openreplay
    }

    async function getCachedJwt() {
        if (isJwtInvalid()) {
            const new_jwt = await getNewJwtToken()

            return new_jwt
        } else {
            return jwtToken
        }
    }

    function isTeamLeader() {
        accessTokenHasExpired()
        if (!metadata?.isTeamLeader) {
            console.warn('isTeamLeader is not defined in metadata')
        }
        return metadata?.isTeamLeader || false
    }

    async function setReqConfig<T = unknown>(
        data?: T,
        responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formdata',
    ) {
        const token = await getCachedJwt()

        const res = {
            data: data,
            responseType: responseType,
            headers: {} as Record<string, string>,
        }

        if (token) {
            res.headers['Authorization'] = `Bearer ${token}`
        }

        return res
    }
    /**
     *
     * @param cache_ttl time for cache to live in hours default 24 hours
     * @returns ICheckForRegisteredSubdomainResponse primarily from cache if do_not_cache is false
     * cache is saved in indexedDB
     */
    async function checkForRegisteredSubdomain(
        _cache_ttl = 24,
        _do_not_cache = false,
    ): Promise<ICheckRegisteredSubdomainResponse<FE> | undefined> {
        accessTokenHasExpired()
        const url = buildURL(`/check?context=subdomain`)

        if (metadata) {
            return {
                metadata: {
                    ...metadata,
                    features: metadata?.features ? Array.from(metadata.features) : undefined,
                },
                message: 'Success',
            }
        }

        const data = await srvAuthGet<ICheckRegisteredSubdomainResponse<FE>>(url)

        /*  await set(url, {
            timestamp: Date.now(),
            data,
        }) */

        return data
    }

    async function getNewJwtToken() {
        const captured = requestGeneration
        try {
            const url = buildURL(`/token` + realWindow.location.search)
            const data = await srvAuthGet<ISigninResponse<FE> & { signout?: boolean }>(url)

            if (!data || 'errors' in data || data.signout) {
                dispatchLogoutEvent()

                return
            }

            return jwtToken
        } catch (error) {
            // A stale failure belongs to the retired request, not a newer login.
            if (captured !== requestGeneration) throw new SharedContextError('stale_context')
            resetData('denied')
            dispatchLogoutEvent()
            console.warn('Token refresh failed')
            return undefined
        }
    }

    function getMetadata() {
        accessTokenHasExpired()
        return metadata
    }
    /**
     *
     * @deprecated use getMetadata
     * @var role = user_role
     * @var connector=journal
     * @var id = customer_id
     */
    function getParsedJwt() {
        accessTokenHasExpired()
        if (metadata && metadata.user_role) {
            return {
                //...metadata,
                customer_id: metadata.customer_id as IUUID,
                journal: metadata.journal,
                journal_user_id: metadata.journal_user_id,
                srv_urls: metadata.srv_urls,
                exp: metadata.exp,
                vt: metadata.vt,
                role: metadata.user_role as never,
                name: metadata.user_name || '',
                region: metadata.region || '',
                journal_role: metadata.journal_role || '',
                user_id: metadata.user_id as IUUID,
                brukerBrukerNavn: metadata.brukerBrukerNavn || '',
                access_level: metadata.access_level || 1,
            } satisfies Omit<IBaseJwtClaims<never>, 'subdomain' | 'genesis_set'> & {
                access_level: 1 | 2 | 3 | 4
                region: string
                journal_role: string
                brukerBrukerNavn: string
            }
        }
        return undefined
    }

    function getFeatures() {
        accessTokenHasExpired()
        if (!metadata?.features) {
            console.warn('no features present in the metadata')
            return
        }
        return Array.from(metadata.features)
    }

    function getSrvUrls() {
        accessTokenHasExpired()
        if (!metadata?.srv_urls) {
            console.warn('no srv_urls present in the metadata')
            return
        }
        return metadata?.srv_urls
    }
    /**
     *
     * @param featureName feature_name_enums add this: generateSrvAuthBindings<feature_name_enums.>(...)
     * @returns boolean
     */
    function hasFeature(featureName: FE) {
        accessTokenHasExpired()
        //let hasFeature = false

        //const asmaFeaturesIgnoreList: string | null = localStorage.getItem('asma-features-ignore-list')
        const enableAllFeatures = localStorage.getItem('enable-all-features') === 'true'

        //const hasFeatureCheck = !!features?.has(featureName)
        //const DEVELOPMENT = EnvConfigsFnInternal().DEVELOPMENT

        //if (EnvConfigsFnInternal().DEVELOPMENT /*  && asmaDebug && asmaFeaturesIgnoreList */) {
        // let asmaEnableAllFeatures: FeatureEnums[] | undefined

        // try {
        //     asmaEnableAllFeatures = JSON.parse(asmaFeaturesIgnoreList)
        // } catch (e) {
        //      console.error(e)
        //  }

        // if (Array.isArray(asmaEnableAllFeatures) && !asmaEnableAllFeatures.includes(featureName)) {
        //      hasFeature = true
        //  } else {
        //hasFeature = hasFeatureCheck
        //   }
        //   return true
        //} else {
        //     hasFeature = hasFeatureCheck
        // }
        /**
         * is used directory_hideParticipantGroups due to the fact that it is wrongly named and enable fretex specific functionality
         * needs to be renamed to directory_enableParticipantGroups. Excluding from dev enabling for now
         */
        if (featureName !== 'directory_hideParticipantGroups') {
            return enableAllFeatures || !!metadata?.features?.has(featureName)
        }

        return !!metadata?.features?.has(featureName)
    }

    function getConnector() {
        accessTokenHasExpired()
        return metadata?.journal
    }

    function getTheme() {
        accessTokenHasExpired()
        if (!metadata?.theme) {
            console.warn('no theme present in the metadata')
            return
        }
        return metadata.theme
    }

    function invalidateActivityStatuses(activityIds?: string[]) {
        ++activityGeneration
        pendingRequests.clear()
        if (!activityIds?.length) {
            activityStatusesCached.clear()
            pendingRequests.clear()
            return
        }

        for (const id of activityIds) {
            activityStatusesCached.delete(id)
        }
    }

    async function getActivityStatuses(
        activityIds: string[],
        signal?: AbortSignal,
    ): Promise<Map<string, ActivityStatus>> {
        const captured = requestGeneration
        const capturedActivity = activityGeneration
        const assertCurrent = () => {
            assertRequestCurrent(captured)
            if (capturedActivity !== activityGeneration || signal?.aborted) throw new SharedContextError('stale_context')
        }
        if (!isJwtValid()) return new Map()
        assertCurrent()
        const result = new Map<string, ActivityStatus>()
        const missingIds: number[] = []
        const now = Date.now()

        for (const id of activityIds) {
            const cached = activityStatusesCached.get(id)
            if (cached && cached.expiresAt > now) {
                result.set(id, cached.value)
            } else {
                const numeric = Number(id)
                if (!Number.isNaN(numeric)) missingIds.push(numeric)
            }
        }

        if (!missingIds.length) return result

        const requestKey = JSON.stringify([captured, capturedActivity, missingIds])

        if (pendingRequests.has(requestKey)) {
            const ongoing = await pendingRequests.get(requestKey)!
            assertCurrent()
            ongoing.forEach((v, k) => result.set(k, v))
            return result
        }

        const requestPromise = (async () => {
            try {
                const response = await editorPost<
                    { SoknadID: number[]; AdVoca: 0 | 1 },
                    { soknadID?: number | null; adgangkode?: number | null }[]
                >({
                    url: '/legacy-ao/ReadOnlyAccessCheck',
                    body: { SoknadID: missingIds, AdVoca: domain === 'advoca' ? 1 : 0 },
                    signal,
                })
                assertCurrent()

                const map = new Map<string, ActivityStatus>()

                const unresolved = new Set(missingIds.map((id) => id.toString()))

                response?.forEach(({ soknadID, adgangkode }) => {
                    if (!soknadID || !adgangkode) return

                    const key = soknadID.toString()
                    const status = getActivityStatus(adgangkode)
                    map.set(key, status)
                    activityStatusesCached.set(key, { value: status, expiresAt: Date.now() + CACHE_TTL })
                    unresolved.delete(key)
                })

                unresolved.forEach((key) => {
                    map.set(key, ActivityStatuses.NO_ACCESS)
                    activityStatusesCached.set(key, {
                        value: ActivityStatuses.NO_ACCESS,
                        expiresAt: Date.now() + CACHE_TTL,
                    })
                })

                return map
            } catch (error) {
                if (error instanceof SharedContextError) throw error
                console.warn('Activity access request failed')
                return new Map<string, ActivityStatus>()
            } finally {
                if (capturedActivity === activityGeneration) pendingRequests.delete(requestKey)
            }
        })()

        pendingRequests.set(requestKey, requestPromise)

        const fetched = await requestPromise
        assertCurrent()
        fetched.forEach((v, k) => result.set(k, v))

        return result
    }

    const auth_bindings = {
        hasFeature: (featureName: FE) => hasFeature(featureName),
        getConnector,
        getTheme,
        getFeatures,
        isJwtValid,
        signin,
        srvAuthGet,
        srvAuthPost,
        getSrvUrls,
        /**
         * @deprecated use dispatchLogoutEvent directly
         */
        signoutAuth: dispatchLogoutEvent,
        dispatchLogoutEvent,
        setReqConfig,
        /**
         * @deprecated use getCachedJwt
         *  */
        getJwtTokenAsync: getCachedJwt,
        getCachedJwt,
        getOpenReplay,
        getNewJwtToken,
        /**
         * @deprecated use registerCallbackOnSrvAuthEvents directly
         */
        registerOnJwtChanges: registerCallbackOnSrvAuthEvents,
        registerCallbackOnSrvAuthEvents,
        getUserId,
        /**
         * @deprecated use getMetadata
         */
        getParsedJwt,
        getMetadata,
        getJwtToken,
        // cancelRequest,
        accessTokenHasExpired,
        checkForRegisteredSubdomain,
        /**@deprecated - do not use it anymore is moved to features `TimeRegistration_TeamleaderOverview` */
        isTeamLeader,
        getActivityStatuses,
        invalidateActivityStatuses,
    } satisfies IAuthBindings<FE>

    realWindow.__ASMA__SHELL__ = realWindow.__ASMA__SHELL__ || {}

    realWindow.__ASMA__SHELL__.auth_bindings = auth_bindings
    managedAuthContexts.set(auth_bindings, attachContext)
    if (options.sharedContext) attachContext(options.sharedContext)

    // Seed the overrides bus from the server-injected first-hit versions so the map is available
    // before any auth response arrives (later responses still dispatch updates). ASMA-7544.
    dispatchCustomerUserRelatedAppVersions(getInjectedPlatform()?.default_app_versions)

    return auth_bindings
}
/**
 * @deprecated use generateSrvAuthBindings
 *
 */

export function generateSrvAuthBindingsMicroApp(
    //SRV_AUTH: () => string,
    //DEVELOPMENT: () => boolean,
    //ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums,
    //EnvConfigsFn: EnvConfigsFn,
    logout?: () => void,
) {
    return (
        realWindow.__ASMA__SHELL__?.auth_bindings ||
        generateSrvAuthBindings(/* SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, */ /* EnvConfigsFn, */ logout)
    )
}

/**
 * Host-only adapter for an already qualified owner URL and the SAME auth producer.
 * Consumers receive fetch/client capability, never a token getter or second session.
 */
export function createSrvAuthContextOwnerClient(
    auth: Pick<IAuthBindings<string>, 'getCachedJwt' | 'isJwtValid' | 'getNewJwtToken'>,
    url: string,
    lease: SharedContextLease,
): SharedContextOwnerClientSource {
    const endpoint = new URL(url).href
    const ownerFetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init)
        lease.assertCurrent()
        if (request.url !== endpoint) throw new SharedContextError('wrong_owner_endpoint')
        async function authorizedRequest() {
            const token = await lease.run(() => auth.getCachedJwt())
            if (!token || !auth.isJwtValid()) throw new SharedContextError('context_unavailable')
            lease.assertCurrent()
            const headers = new Headers(request.headers)
            headers.set('Authorization', `Bearer ${token}`)
            return new Request(request.clone(), { headers, redirect: 'error', signal: AbortSignal.any([request.signal, lease.signal]) })
        }
        let response = await lease.run(async () => {
            const authorized = await authorizedRequest()
            lease.assertCurrent()
            return fetch(authorized)
        })
        if (response.status === 401) {
            await lease.run(() => auth.getNewJwtToken())
            response = await lease.run(async () => {
                const authorized = await authorizedRequest()
                lease.assertCurrent()
                return fetch(authorized)
            })
        }
        return response
    }
    return Object.freeze({ url: endpoint, fetch: ownerFetch })
}

let current_app_version: Record<string, string> | undefined = undefined

function dispatchCustomerUserRelatedAppVersions(new_app_version?: Record<string, string>) {
    if (!new_app_version || Object.keys(new_app_version).length === 0) {
        return
    }

    if (!current_app_version || !deepEqual(current_app_version, new_app_version)) {
        asmaOverridesEventBus.dispatch('default-map-changed', new_app_version)
    }

    current_app_version = new_app_version
}

function deepEqual(x: Record<string, string>, y: Record<string, string>) {
    return sortStringify(x) === sortStringify(y)
}

function sortStringify(x: Record<string, string>) {
    Object.keys(x)
        .sort()
        .reduce(
            (acc, key) => {
                const x_key = x?.[key]
                if (x_key) {
                    acc[key] = x_key
                }

                return acc
            },
            {} as Record<string, string>,
        )

    return JSON.stringify(x)
}
/**
 *
 * @param headers
 * @returns
 */
function attachAdditionalHeaders(headers: Record<string, string>) {
    const predefined_debug_user_secret = localStorage.getItem('predefined-debug-user-secret') || undefined

    if (predefined_debug_user_secret) {
        headers = { ...headers, 'predefined-debug-user-secret': predefined_debug_user_secret }
    }

    const do_not_notify = localStorage.getItem('do-not-notify') || undefined

    if (do_not_notify) {
        headers = { ...headers, 'do-not-notify': do_not_notify }
    }

    const genesis_user_secret_enabling_code = localStorage.getItem('genesis-secret-activation-code') || undefined

    if (genesis_user_secret_enabling_code) {
        headers = { ...headers, 'genesis-secret-activation-code': genesis_user_secret_enabling_code }
    }
    const genesis_user_secret = localStorage.getItem('genesis-user-secret') || undefined

    if (domain === 'advoca' && genesis_user_secret) {
        headers = { ...headers, 'genesis-user-secret': `genesis-user-secret.${genesis_user_secret}` }
    }

    return headers
}

function buildURL(pathname = '') {
    // If path is absolute, return it as-is
    const srv_auth = EnvConfigsFnInternal().SRV_AUTH
    if (srv_auth.startsWith('http://') || srv_auth.startsWith('https://')) {
        return new URL(srv_auth + pathname)
    }
    // Otherwise, resolve against the base URL
    return new URL(srv_auth + pathname, window.location.origin)
}
