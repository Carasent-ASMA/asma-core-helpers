import axios, { type AxiosResponse, type ResponseType } from 'axios'
import { EventBus } from 'asma-event-bus/lib/event-buss'
import { EnvironmentEnums, parseJwt } from '..'

//let logoutsuccesfull = false



export const { dispatch: dispatchSrvAuthEvents, register: registerCallbackOnSrvAuthEvents } = EventBus<{ jwt_changed: {}; logout_event: {} }>(
    'auth-bindings',
    )
    
    export function generateSrvAuthBindings<FeatureEnums = never>(
        SRV_AUTH: () => string,
        DEVELOPMENT: () => boolean,
        EnvironmentToOperateFn: () => string,
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

    let parsed_jwt: unknown | undefined


    
  

   /*  let fetchJwtPromise: Promise<{
        data: { message: string; token?: string; features?: FeatureEnums[]; errors: { message: string }[] }
    }> | null = null */

    const isJwtInvalid = () => (jwtToken && accessTokenHasExpired()) || !jwtToken

    const isJwtValid = () => !isJwtInvalid()

    //function cancelRequest() {
    //    return logoutsuccesfull
    // }

    const promiseRegistry: Record<string,Promise<unknown>> = <{}>{}

    async function srvAuthGet<R>(url: string, headers?: Record<string, string>) {
        if (DEVELOPMENT() && EnvironmentToOperateFn()) {
            if (EnvironmentToOperateFn() in EnvironmentEnums) {
                url = `${url}&env=${EnvironmentToOperateFn()}`

                // file deepcode ignore GlobalReplacementRegex: <it is intended to be replaced only first occurence>
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
        

        

        const promise = promiseRegistry[url] ||axios.get<unknown, AxiosResponse<R>>(`${SRV_AUTH()}${url}`, {
           
            headers: {
                ...headers,
                'asma-origin': window.location.origin,
            },
            withCredentials: true,
        })

        if(!promiseRegistry[url]){
            promiseRegistry[url] = promise
        }
        try{
            const res = await promise

            return res as AxiosResponse<R, any>
        }catch(e){
            console.error(e)
            return
        }finally{
            delete promiseRegistry[url] 
        }
    }

    function accessTokenHasExpired(): boolean {
        const tokenObj = getParsedJwt()

        const accessTokenExpDate = tokenObj?.exp || 0

        const nowTime = Math.floor(new Date().getTime() / 1000)

        //set exp time -20sec for token to be refreshed early
        return accessTokenExpDate - 10 <= nowTime
    }

    async function signin(url: string, headers?: Record<string, string>) {
      

        const data = await srvAuthGet<{ token: string; features: FeatureEnums[] }>(url, headers)

        setAuthData(data?.data)

        // logoutsuccesfull = false

        return data
    }

    const {unregister} =registerCallbackOnSrvAuthEvents('logout_event',()=>{
        
        setAuthData({ token: '' })
        
        srvAuthGet('/signout')
        
        unregister()
    })

    async function signoutAuth() {

        dispatchSrvAuthEvents('logout_event', {}, false)
            
           // return srvAuthGet('/signout')
           
    }

    function getUserId(): string {
        return getParsedJwt()?.['user_id'] || '-1'
    }

    function setAuthData(data?: { token: string; features?: FeatureEnums[] }) {
        if(data){
            jwtToken = data?.token 
            
            features = new Set(data.features)
           
            parsed_jwt = parseJwt(jwtToken)
        }
        
        dispatchSrvAuthEvents('jwt_changed', {}, false)

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
           /*  if (!fetchJwtPromise) {
                fetchJwtPromise = srvAuthGet('/token')
            } */

            const data = await srvAuthGet<{errors?:string;token:string,features:FeatureEnums[]}>('/token')

            if (!data || data.data?.errors  || !data.data.token) {
                
                dispatchSrvAuthEvents('logout_event', {}, false)

                return
            }

            setAuthData({ token: data.data.token || '', features: data.data.features || [] })
        } catch (error) {
            
            dispatchSrvAuthEvents('logout_event', {}, false)

            setAuthData({ token: '', features: [] })

            
            console.error(error)
        } finally {
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
