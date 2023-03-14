//import axios, { type AxiosResponse, type ResponseType } from 'axios'
import { EventBus } from 'asma-event-bus/lib/event-buss'
import { EnvironmentEnums } from '../interfaces/enums'
import { setTheme } from './checkForRegisteredSubdomains'
import { parseJwt } from './parseJwt'

//let logoutsuccesfull = false

export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus<{
    jwt_changed: {}
    logout_event: {}
    customer_changed: {}
}>('auth-bindings')

function dispatchLogoutEvent() {
    dispatchSrvAuthEvents('logout_event', {}, false)
}
function dispatchJwtChangedEvent() {
    dispatchSrvAuthEvents('jwt_changed', {}, false)
}
/**
 * @generic FeatureEnums - feature_names_enums from asma-genql-directory
 * @generic SrvUrlsEnums - srv_names_enums from asma-genql-directory
 */

type EnvConfigsFn = () => { SRV_AUTH: string; DEVELOPMENT: boolean; ENVIRONMENT_TO_OPERATE: string }

export function generateSrvAuthBindings<FeatureEnums = never, SrvUrlsEnums extends string = never>(
    //SRV_AUTH: () => string,
    //DEVELOPMENT: () => boolean,
    //EnvironmentToOperateFn: () => string,
    EnvConfigsFn: EnvConfigsFn,
    logout?: () => void,
) {
    if (logout) {
        registerCallbackOnSrvAuthEvents('logout_event', logout)
    }

    if (window.__ASMA__SHELL__?.auth_bindings) {
        return window.__ASMA__SHELL__.auth_bindings as typeof auth_bindings
    }

    let jwtToken = ''

    let features: Set<FeatureEnums> | undefined

    let connector: string | undefined

    let parsed_jwt: unknown | undefined

    let srv_urls: Record<SrvUrlsEnums, string> | undefined

    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken

    const isJwtValid = () => !isJwtInvalid()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promiseRegistry: Record<string, Promise<Response>> = <{}>{}

    async function srvAuthGet<R>(url: string, headers?: Record<string, string>): Promise<R> {
        if (EnvConfigsFn().DEVELOPMENT && EnvConfigsFn().ENVIRONMENT_TO_OPERATE) {
            if (EnvConfigsFn().ENVIRONMENT_TO_OPERATE in EnvironmentEnums) {
                url = `${url}&env=${EnvConfigsFn().ENVIRONMENT_TO_OPERATE}`

                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurence>
                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url
            } else {
                console.warn(
                    'EnvironmentToOperateFn() is not a valid EnvironmentEnums',
                    'shall be one of:',
                    EnvironmentEnums,
                    'actual value:',
                    EnvConfigsFn().ENVIRONMENT_TO_OPERATE,
                )
            }
        }

        if (!promiseRegistry[url]) {
            promiseRegistry[url] = fetch(`${EnvConfigsFn().SRV_AUTH}${url}`, {
                headers: {
                    ...headers,
                    'asma-origin': window.location.origin,
                },
                credentials: 'include',
                //withCredentials: true,
            })
        }

        const res = await promiseRegistry[url]!.finally(() => {
            delete promiseRegistry[url]
        })

        const json: R = await res.clone().json()

        if (!res?.ok) {
            let error: R | string = json
            if (!json) {
                error = await res.clone().text()
            }

            throw error
        }

        return json
    }

    function accessTokenHasExpired(): boolean {
        const tokenObj = getParsedJwt()

        const accessTokenExpDate = tokenObj?.exp || 0

        const nowTime = Math.floor(new Date().getTime() / 1000)

        return accessTokenExpDate - 10 <= nowTime
    }

    /**
     *
     * TODO: need to investigate smarter way of registerning and unregistering on `logout_event`
     **/
    registerCallbackOnSrvAuthEvents('logout_event', () => {
        setAuthData({ token: '' })

        srvAuthGet('/signout')
    })

    async function signin(url: string, headers?: Record<string, string>) {
        const data = await srvAuthGet<{
            token: string
            features: FeatureEnums[]
            connector?: string
            srv_urls: typeof srv_urls
        }>(url, headers)

        setAuthData(data)

        return data
    }

    function getUserId(): string {
        return getParsedJwt()?.['user_id'] || '-1'
    }

    function setAuthData(data?: {
        token: string
        features?: FeatureEnums[]
        connector?: string
        theme?: string
        srv_urls?: typeof srv_urls
    }) {
        if (data?.token) {
            jwtToken = data?.token

            features = new Set(data.features)

            connector = data.connector

            parsed_jwt = parseJwt(jwtToken)

            srv_urls = data.srv_urls

            dispatchJwtChangedEvent()

            data.theme && setTheme(data.theme)

            return
        }
        jwtToken = ''

        parsed_jwt = undefined

        features = undefined

        srv_urls = undefined

        connector = undefined
    }

    function getJwtToken() {
        return jwtToken
    }

    async function getCachedJwt() {
        if (isJwtInvalid()) {
            const new_jwt = await getNewJwtToken()

            return new_jwt
        } else {
            return jwtToken
        }
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

    async function getNewJwtToken() {
        try {
            /*  if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            } */

            const data = await srvAuthGet<{
                errors?: string
                token: string
                features: FeatureEnums[]
                connector: string
                srv_urls?: typeof srv_urls
                theme: string
            }>('/token')

            if (!data || data?.errors || !data.token) {
                dispatchLogoutEvent()
                return
            }
            setAuthData(data)
            return jwtToken
        } catch (error) {
            dispatchLogoutEvent()

            console.error(error)

            return jwtToken
        }
    }

    function getParsedJwt<R = { user_id: string; exp: number }>(): R | undefined {
        if (!parsed_jwt) {
            parsed_jwt = parseJwt<R>(jwtToken)
        }
        return parsed_jwt as R
    }
    function getFeatures() {
        return features
    }
    function getSrvUrls() {
        return srv_urls
    }
    /**
     *
     * @param featureName feature_name_enums add this: generateSrvAuthBindings<feature_name_enums.>(...)
     * @returns boolean
     */
    function hasFeature(featureName: FeatureEnums) {
        let hasFeature = false

        const asmaFeaturesIgnoreList: string | null = localStorage.getItem('asma-features-ignore-list')
        const asmaDebug = localStorage.getItem('asma-debug') === 'true'

        const hasFeatureCheck = !!features?.has(featureName)

        if (EnvConfigsFn().DEVELOPMENT && asmaDebug && asmaFeaturesIgnoreList) {
            let asmaEnableAllFeatures: FeatureEnums[] | undefined

            try {
                asmaEnableAllFeatures = JSON.parse(asmaFeaturesIgnoreList)
            } catch (e) {
                console.error(e)
            }

            if (Array.isArray(asmaEnableAllFeatures) && !asmaEnableAllFeatures.includes(featureName)) {
                hasFeature = true
            } else {
                hasFeature = hasFeatureCheck
            }
        } else {
            hasFeature = hasFeatureCheck
        }
        return hasFeature
    }

    function getConnector() {
        return connector
    }

    const auth_bindings = {
        hasFeature,
        getConnector,
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
        getNewJwtToken,
        /**
         * @deprecated use registerCallbackOnSrvAuthEvents directly
         */
        registerOnJwtChanges: registerCallbackOnSrvAuthEvents,
        getUserId,
        getParsedJwt,
        getJwtToken,
        // cancelRequest,
        accessTokenHasExpired,
    }
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {}

    window.__ASMA__SHELL__.auth_bindings = auth_bindings

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
    EnvConfigsFn: EnvConfigsFn,
    logout?: () => void,
) {
    return (
        window.__ASMA__SHELL__?.auth_bindings ||
        generateSrvAuthBindings(/* SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, */ EnvConfigsFn, logout)
    )
}
