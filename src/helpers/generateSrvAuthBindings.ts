import { EventBus } from 'asma-event-bus/lib/event-buss'
import { EnvironmentEnums } from '../interfaces/enums'
import { setTheme } from './checkForRegisteredSubdomains'
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings'
import { asmaOverridesEventBus } from 'asma-event-bus/lib'
import { realWindow, type IAuthBindings } from '..'
import { get as _ } from 'idb-keyval'
import type { ICheckSigninOptions, ICheckSigninTransformedOptions } from './generateSrvAuthBindings.types'
import type { IBaseJwtClaims, IUUID } from 'asma-types/lib'

//let logoutSuccessful = false

export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus<{
    jwt_changed?: ICheckSigninOptions<any> //IBaseJwtClaims<'super_user' | 'therapist' | 'recipient'>
    logout_event: {}
    customer_changed: {}
}>('auth-bindings')

function dispatchLogoutEvent() {
    dispatchSrvAuthEvents('logout_event', {}, false)
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

export async function srvAuthGetInternal<R>(url: string, headers?: Record<string, string>) {
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
export type IOpenReplay = {
    enable: boolean
    live_assist: boolean
    graphql: boolean
    mobx: boolean
    profiler: boolean
}

export type ISigninResponse<FE extends string> = {
    message: 'Success'
    token: string
    metadata?: ICheckSigninOptions<FE>
}
export type ICheckResponse<FE extends string> = {
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

    async function srvAuthGet<R>(url: string, headers?: Record<string, string>): Promise<R> {
        const { ENVIRONMENT_TO_OPERATE, DEVELOPMENT } = EnvConfigsFnInternal()

        if (DEVELOPMENT && ENVIRONMENT_TO_OPERATE) {
            if (ENVIRONMENT_TO_OPERATE in EnvironmentEnums) {
                url = `${url}&env=${EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE}`

                if (realWindow.location.port) {
                    url = `${url}&port=${realWindow.location.port}`
                }

                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurrence>
                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url
            } else {
                console.warn(
                    'EnvironmentToOperateFn() is not a valid EnvironmentEnums',
                    'shall be one of:',
                    EnvironmentEnums,
                    'actual value:',
                    EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE,
                )
            }
        }

        if (!promiseRegistry[url]) {
            promiseRegistry[url] = fetch(`${EnvConfigsFnInternal().SRV_AUTH}${url}`, {
                headers: {
                    ...headers,
                },

                credentials: 'include',
                //withCredentials: true,
            })
        }

        const res = await promiseRegistry[url]!.finally(() => {
            delete promiseRegistry[url]
        })

        const json: R = await res.clone().json()

        if (typeof json === 'object' && json !== null && 'default_app_versions' in json) {
            dispatchCustomerUserRelatedAppVersions(json.default_app_versions as Record<string, string>)

            //delete json.default_app_versions
        }

        if (!res?.ok) {
            let error: R | string = json

            if (!json) {
                error = await res.clone().text()
            }

            throw error
        }

        if (res.status === 299 && EnvConfigsFnInternal().DEVELOPMENT) {
            console.info(json)
        }

        return json
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
    registerCallbackOnSrvAuthEvents('logout_event', () => {
        setAuthData({ token: '' })

        srvAuthGet('/signout')
    })

    async function signin(url: string, headers?: Record<string, string>): Promise<ISigninResponse<FE>> {
        if (isJwtValid() && metadata) {
            return {
                //features: metadata?.features ? Array.from(metadata.features) : [],
                token: jwtToken,
                // connector: metadata?.journal,
                //  openreplay: metadata?.openreplay,
                //   srv_urls: metadata?.srv_urls,
                //   theme: getTheme(),
                //   isTeamLeader: metadata?.isTeamLeader || false,
                //   default_app_versions: metadata?.default_app_versions || {},
                metadata: {
                    ...metadata,
                    features: metadata?.features ? Array.from(metadata.features) : undefined,
                },
                message: 'Success',
            }
        }
        const data = await srvAuthGet<ISigninResponse<FE>>(url, headers)

        setAuthData(data)

        return data
    }

    function getUserId() {
        return getMetadata()?.user_id
    }

    function setAuthData(data?: Partial<ISigninResponse<FE>>) {
        if (data?.token) {
            jwtToken = data?.token
            if (data.metadata) {
                metadata = { ...data.metadata, features: new Set(data.metadata?.features) }
            } else {
                console.error('metadata is not defined in data', 'data: ', data)
            }

            dispatchJwtChangedEvent(data.metadata)

            data.metadata?.theme && setTheme(data.metadata.theme)

            return
        }

        jwtToken = ''

        metadata = undefined
    }

    function getJwtToken() {
        return jwtToken
    }

    function getOpenReplay() {
        if (!metadata?.openreplay) {
            console.warn('openreplay is not defined in metadata', 'metadata: ', metadata)
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
            console.warn('isTeamLeader is not defined in metadata', 'metadata: ', metadata)
        }
        return metadata?.isTeamLeader || false
    }

    async function setReqConfig<T = unknown>(
        data?: T,
        responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream',
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
    ): Promise<ICheckResponse<FE> | undefined> {
        const url = `/check?context=subdomain`
        /* 
        if (do_not_cache) {
            const cachedData = await get<{
                timestamp: string
                data: ICheckForRegisteredSubdomainResponse<FeatureEnums>
            }>(url)

            if (
                cachedData?.timestamp &&
                new Date().getTime() - new Date(cachedData.timestamp).getTime() < cache_ttl * 60 * 60 * 1000 &&
                cachedData.data
            ) {
                return cachedData.data
            }
        } */
        if (isJwtInvalid() && metadata) {
            return {
                metadata: {
                    ...metadata,
                    features: metadata?.features ? Array.from(metadata.features) : undefined,
                },
                message: 'Success',
            }
        }

        const data = await srvAuthGet<ICheckResponse<FE>>(url)

        /*  await set(url, {
            timestamp: Date.now(),
            data,
        }) */

        setAuthData(data)

        return data
    }

    async function getNewJwtToken() {
        try {
            /*  if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            } */
            const searchParams = new URLSearchParams(realWindow.location.search)
            const data = await srvAuthGet<
                ISigninResponse<FE> /* {
                errors?: string
                token: string
                features: FeatureEnums[]
                connector: string
                srv_urls?: typeof srv_urls
                theme: string
            } */
            >(`/token?${searchParams.toString()}`)

            if (!data || 'errors' in data /* ?.errors */ || !data.token) {
                dispatchLogoutEvent()
                return
            }

            setAuthData(data)
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
                region: '',
                subdomain: '',
                genesis_set: '',
                journal_role: metadata.journal_role || '',
                user_id: metadata.user_id as IUUID,
                brukerBrukerNavn: metadata.brukerBrukerNavn || '',
            } satisfies IBaseJwtClaims<never>
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
        return metadata?.theme
    }

    const auth_bindings = {
        hasFeature: (featureName: FE) => hasFeature(featureName),
        getConnector,
        getTheme,
        getFeatures,
        isJwtValid,
        signin,
        srvAuthGet,
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
        isTeamLeader,
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
        .reduce((acc, key) => {
            const x_key = x?.[key]
            if (x_key) {
                acc[key] = x_key
            }

            return acc
        }, {} as Record<string, string>)

    return JSON.stringify(x)
}
