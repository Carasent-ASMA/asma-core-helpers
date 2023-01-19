import axios, { type AxiosResponse, type ResponseType } from 'axios'
import { EnvironmentEnums, parseJwt } from '..'

let logoutsuccesfull = false

let abortController = new AbortController()

export function getAbortController() {
    return window.__ASMA__SHELL__?.abortController
}

export function generateSrvAuthBindings<FeatureEnums = never>(
    SRV_AUTH: () => string,
    DEVELOPMENT: () => boolean,
    EnvironmentToOperateFn: () => string,
    logout?: () => void,
) {
    let logoutMfes: (() => void)[] = []

    if (logout && window.__ASMA__SHELL__?.auth_bindings) {
        logoutMfes.push(logout)
    }

    if (window.__ASMA__SHELL__?.auth_bindings) {
        window.__ASMA__SHELL__.logoutMfes = logoutMfes
        return window.__ASMA__SHELL__.auth_bindings as typeof auth_bindings
    }

    let jwtToken = ''

    let features: Set<FeatureEnums> | undefined

    let parsed_jwt: any | undefined

    let fetchJwtPromise: Promise<{
        data: { message: string; token?: string; features?: FeatureEnums[]; errors: { message: string }[] }
    }> | null = null

    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken

    const isJwtValid = () => !isJwtInvalid()

    function cancelRequest() {
        return logoutsuccesfull
    }

    async function srvAuthGet<R>(url: string, headers?: Record<string, string>) {
        if (DEVELOPMENT() && EnvironmentToOperateFn()) {
            if (EnvironmentToOperateFn() in EnvironmentEnums) {
                url = `${url}&env=${EnvironmentToOperateFn()}`

                url = url.includes('&') && !url.includes('?') ? url.replace('&', '?') : url
            } else {
                console.warn(
                    'EnvironmentToOperateFn() is not a valid EnvironmentEnums',
                    'shall be one of:',
                    EnvironmentEnums,
                    'actual value:',
                    EnvironmentToOperateFn(),
                )
            }
        }

        return axios.get<unknown, AxiosResponse<R>>(`${SRV_AUTH()}${url}`, {
            signal: getAbortController()?.signal,
            headers: {
                ...headers,
                'asma-origin': window.location.origin,
            },
            withCredentials: true,
        })
    }

    function accessTokenHasExpired(): boolean {
        const tokenObj = getParsedJwt()

        const accessTokenExpDate = tokenObj?.exp || 0

        const nowTime = Math.floor(new Date().getTime() / 1000)

        //set exp time -20sec for token to be refreshed early
        return accessTokenExpDate - 10 <= nowTime
    }

    async function signin(url: string, headers?: Record<string, string>) {
        if (abortController.signal.aborted) {
            abortController = new AbortController()
        }

        const { data } = await srvAuthGet<{ token: string; features: FeatureEnums[] }>(url, headers)

        setAuthData(data)

        logoutsuccesfull = false

        return data
    }

    async function signoutAuth() {
        setAuthData({ token: '' })
        await srvAuthGet('/signout')
    }
    function getUserId(): string {
        return getParsedJwt()?.['user_id'] || '-1'
    }

    function setAuthData(data: { token: string; features?: FeatureEnums[] }) {
        jwtToken = data.token
        features = new Set(data.features)
        parsed_jwt = undefined
    }

    function getJwtToken() {
        return jwtToken
    }

    async function getJwtTokenAsync() {
        if (isJwtInvalid()) {
            const new_jwt = await getNewJwtToken()

            return new_jwt
        } else {
            return jwtToken
        }
    }

    async function setReqConfig<T = unknown>(data?: T, responseType?: ResponseType) {
        const token = await getJwtTokenAsync()

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
        if (logoutsuccesfull) return
        try {
            if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            }

            const { data } = await fetchJwtPromise

            if (!data || data.errors || data.message != 'Success' || !data.token) {
                logout?.()
                logoutsuccesfull = true
                abortController?.abort()
                //signoutAuth()
            }

            setAuthData({ token: data.token || '', features: data.features || [] })
        } catch (error) {
            logout?.()
            logoutsuccesfull = true
            abortController?.abort()

            //signoutAuth()

            setAuthData({ token: '', features: [] })

            console.error(error)
        } finally {
            fetchJwtPromise = null

            return jwtToken
        }
    }

    function getParsedJwt<R = { user_id: string; exp: number }>(): R | undefined {
        if (!parsed_jwt) {
            parsed_jwt = parseJwt<R>(jwtToken)
        }
        return parsed_jwt
    }
    function getFeatures() {
        return features
    }
    /**
     *
     * @param featureName feature_name_enums add this: generateSrvAuthBindings<feature_name_enums.>(...)
     * @returns boolean
     */
    function hasFeature(featureName: FeatureEnums) {
        return !!features?.has(featureName)
    }

    const auth_bindings = {
        hasFeature,
        getFeatures,
        isJwtValid,
        signin,
        srvAuthGet,
        signoutAuth,
        setReqConfig,
        getJwtTokenAsync,
        getNewJwtToken,
        getUserId,
        getParsedJwt,
        abortController,
        getJwtToken,
        cancelRequest,
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
    SRV_AUTH: () => string,
    DEVELOPMENT: () => boolean,
    ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums,
    logout?: () => void,
) {
    return (
        window.__ASMA__SHELL__?.auth_bindings ||
        generateSrvAuthBindings(SRV_AUTH, DEVELOPMENT, ENVIRONMENT_TO_OPERATE, logout)
    )
}
