import { asmaOverridesEventBus, EventBus } from 'asma-event-bus'
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings.js'
import { realWindow } from './getSubdomain.js'
import { get as _ } from 'idb-keyval'
import type { ICheckSigninOptions, ICheckSigninTransformedOptions } from './generateSrvAuthBindings.types.js'
import { domain, type ActivityStatus, type IAuthBindings } from '../index.js'
import type { IBaseJwtClaims, IUUID } from 'asma-types'
import { getActivityStatus } from './getActivityStatus'

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
 * @generic FeatureEnums - feature_names_enums from asma-genql-directory
 * @generic SrvUrlsEnums - srv_names_enums from asma-genql-directory
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

export function generateSrvAuthBindings<FE extends string>(logout?: () => void) {
    if (logout) {
        registerCallbackOnSrvAuthEvents('logout_event', logout)
    }

    if (realWindow.__ASMA__SHELL__?.auth_bindings) {
        return realWindow.__ASMA__SHELL__.auth_bindings as typeof auth_bindings
    }
    let jwtToken = ''

    let metadata: ICheckSigninTransformedOptions<FE> | undefined

    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken

    const isJwtValid = () => !isJwtInvalid()

    const promiseRegistry: Record<string, Promise<Response>> = <{}>{}

    async function _handleSrvAuthRequest<R>(url: string | URL, fetchOptions: RequestInit): Promise<R> {
        if (typeof url === 'string') {
            url = buildURL(url)
        }

        if (!promiseRegistry[url.pathname]) {
            promiseRegistry[url.pathname] = fetch(url.toString(), fetchOptions)
        }

        const res = await promiseRegistry[url.pathname]!.finally(() => {
            delete promiseRegistry[url.pathname]
        })

        const responseData = (await res.clone().json()) as R

        if (typeof responseData === 'object' && responseData !== null && 'default_app_versions' in responseData) {
            dispatchCustomerUserRelatedAppVersions(responseData.default_app_versions as Record<string, string>)
        }

        if (!res.ok) {
            throw responseData
        }

        if (res.status === 299 && EnvConfigsFnInternal().DEVELOPMENT) {
            console.info(responseData)
        }

        setAuthData(responseData as Partial<ISigninResponse<FE>>)

        return responseData
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

    async function connectorPost<T = unknown, R = unknown>({
        url,
        body,
        headers,
    }: {
        url: string | URL
        body?: T
        headers?: Record<string, string>
    }): Promise<R> {
        const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': metadata?.customer_id ?? '',
                region: metadata?.region ?? '',
                ...headers,
            },
            body: JSON.stringify(body),
            credentials: 'include',
        }
        const response = await fetch(url.toString(), fetchOptions)
        return response as R
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
        const tokenObj = getMetadata()

        const accessTokenExpDate = tokenObj?.exp || 0

        const nowTime = Math.floor(new Date().getTime() / 1000)

        return accessTokenExpDate - 10 <= nowTime
    }

    /**
     *
     * TODO: need to investigate smarter way of registering and unregister on `logout_event`
     **/
    registerCallbackOnSrvAuthEvents('logout_event', async ({ device }) => {
        resetData()
        const url = buildURL('/signout')
        if (device === 'UNTRUSTED') {
            url.searchParams.append('unset', 'device_authorization_token')
        }
        await srvAuthGet(url)
    })

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
    function resetData() {
        jwtToken = ''
    }

    function setAuthData(data?: Partial<ISigninResponse<FE>>) {
        if (data?.metadata) {
            metadata = {
                ...data.metadata,
                features: new Set(data.metadata?.features),
                overviews: data.metadata?.overviews ? data.metadata.overviews : metadata?.overviews,
            }
        }
        if (data?.token) {
            jwtToken = data?.token

            dispatchJwtChangedEvent(data.metadata)

            //data.metadata?.theme!== metadata?.theme setTheme(data.metadata.theme)
        }
        if (!data?.metadata && !data?.token) {
            console.warn('no metadata or token present in the response', 'data: ', data)
        }
    }

    function getJwtToken() {
        return jwtToken
    }

    function getOpenReplay() {
        if (!metadata?.openreplay) {
            console.warn('openreplay is not defined in metadata: ', metadata)
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
        if (!metadata?.isTeamLeader) {
            console.warn('isTeamLeader is not defined in metadata: ', metadata)
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
        try {
            const url = buildURL(`/token` + realWindow.location.search)
            const data = await srvAuthGet<ISigninResponse<FE> & { signout?: boolean }>(url)

            data.signout && logout?.()

            if (!data || 'errors' in data || data.signout) {
                dispatchLogoutEvent()

                return
            }

            return jwtToken
        } catch (error) {
            dispatchLogoutEvent()

            console.warn(error)

            return jwtToken
        }
    }

    function getMetadata() {
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
        if (!metadata?.features) {
            console.warn('no features present in the metadata', 'metadata: ', metadata)
            return
        }
        return Array.from(metadata.features)
    }
    function getSrvUrls() {
        if (!metadata?.srv_urls) {
            console.warn('no srv_urls present in the metadata', 'metadata: ', metadata)
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
        return metadata?.journal
    }

    function getTheme() {
        if (!metadata?.theme) {
            console.warn('no theme present in the metadata', 'metadata: ', metadata)
            return
        }
        return metadata.theme
    }

    type CachedActivityStatus = {
        value: ActivityStatus
        expiresAt: number
    }

    const CACHE_TTL = 1000 * 60 * 5 // 5 minutes
    const activityStatusesCached = new Map<string, CachedActivityStatus>()

    // Tracks ongoing requests to deduplicate
    const pendingRequests = new Map<string, Promise<Map<string, ActivityStatus>>>()

    async function getActivityStatuses(activityIds: string[]): Promise<Map<string, ActivityStatus>> {
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

        const requestKey = missingIds.join(',')

        if (pendingRequests.has(requestKey)) {
            const ongoing = await pendingRequests.get(requestKey)!
            ongoing.forEach((v, k) => result.set(k, v))
            return result
        }

        const requestPromise = (async () => {
            try {
                const response = await connectorPost<
                    { SoknadID: number[] },
                    {
                        data?: { soknadID?: number | null; adgangkode?: number | null }[]
                        error?: string
                        error_full?: string
                        error_response?: string
                    }
                >({
                    url: new URL(
                        EnvConfigsFnInternal().SRV_CONNECTOR + '/api/ReadOnlyAccessCheck',
                        window.location.origin,
                    ),
                    body: { SoknadID: missingIds },
                })

                if (response.error || response.error_full || response.error_response) {
                    throw new Error(response.error || response.error_full || response.error_response)
                }

                const map = new Map<string, ActivityStatus>()

                response.data?.forEach(({ soknadID, adgangkode }) => {
                    if (!soknadID || !adgangkode) return

                    const key = soknadID.toString()
                    const status = getActivityStatus(adgangkode)
                    map.set(key, status)
                    activityStatusesCached.set(key, { value: status, expiresAt: Date.now() + CACHE_TTL })
                })

                return map
            } catch (error) {
                console.error(error)
                return new Map<string, ActivityStatus>()
            } finally {
                pendingRequests.delete(requestKey)
            }
        })()

        pendingRequests.set(requestKey, requestPromise)

        const fetched = await requestPromise
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
    } satisfies IAuthBindings<FE>

    realWindow.__ASMA__SHELL__ = realWindow.__ASMA__SHELL__ || {}

    realWindow.__ASMA__SHELL__.auth_bindings = auth_bindings

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
        headers = { ...headers, 'genesis-user-secret': `genesis_user_secret.${genesis_user_secret}` }
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
