import axios, {type  AxiosResponse, type ResponseType } from 'axios'
import { EnvironmentEnums, parseJwt } from '..'

export function generateSrvAuthBindings<FeatureEnums = never>(
    SRV_AUTH: () => string,
    DEVELOPMENT: () => boolean,
    EnvironmentToOperateFn: () => string,
    logout?: () => void,
) {
    if (window.__ASMA__SHELL__?.auth_bindings) {
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
        const { data } = await srvAuthGet<{ token: string; features: FeatureEnums[] }>(url, headers)

        setAuthData(data)

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
        try {
            if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            }

            const { data } = await fetchJwtPromise

            if (!data || data.errors || data.message != 'Success') {
                logout?.() || signoutAuth()
            }
            if (!data.token) {
                throw new Error('Token is not present in the result')
            }
            setAuthData({ token: data.token || '', features: data.features || [] })

            fetchJwtPromise = null

            return jwtToken
        } catch (error) {
            logout?.() || signoutAuth()
            //signoutAuth()

            fetchJwtPromise = null

            console.error(error)

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
        getJwtToken,
        accessTokenHasExpired,
    }
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {}

    window.__ASMA__SHELL__.auth_bindings = auth_bindings

    return auth_bindings
}
/**
 * @deprecated use generateSrvAuthBindings
 * @param SRV_AUTH
 * @param DEVELOPMENT
 * @param ENVIRONMENT_TO_OPERATE
 * @param logout
 * @returns
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
