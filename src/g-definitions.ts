import { type History, createBrowserHistory } from 'history'
import type { ICheckRegisteredSubdomainResponse, IOpenReplay, ISigninResponse } from './helpers/generateSrvAuthBindings'
import type { IGlobalOpenReplay } from './helpers/openReplayObject'
import { realWindow } from '.'
import type { ICheckSigninOptions, ICheckSigninTransformedOptions } from './helpers/generateSrvAuthBindings.types'
import type { IBaseJwtClaims } from 'asma-types/lib'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
export {}

/**
 *  declare optional rawWindow  which is added by micro-app framework in child apps
 * when is used @micro-zoe/micro-app package
 */
export type IAuthBindings<FE extends string> = {
    getTheme: () => string | undefined
    isJwtValid: () => boolean
    getConnector: () => string | undefined
    getCachedJwt: () => Promise<string | undefined>
    /** @important do not use url as string but rather pass an URL object */
    srvAuthGet: <R>(url: string | URL, headers?: Record<string, string>) => Promise<R>
    srvAuthPost: <R = unknown, T = unknown>(
        url: string | URL,
        body?: T | undefined,
        headers?: Record<string, string>,
    ) => Promise<R>
    setReqConfig: <T = unknown>(
        data?: T | undefined,
        responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formdata',
    ) => Promise<{
        data: T | undefined
        responseType: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formdata' | undefined
        headers: Record<string, string>
    }>
    getSrvUrls: () => Record<'ao_wrapper' | 'connector', string> | undefined
    checkForRegisteredSubdomain: (
        _cache_ttl?: number,
        _do_not_cache?: boolean,
    ) => Promise<ICheckRegisteredSubdomainResponse<FE> | undefined>
    getNewJwtToken: () => Promise<string | undefined>
    /**
     *
     * @deprecated use getMetadata instead
     */
    getParsedJwt: () => Omit<IBaseJwtClaims<never>, 'subdomain' | 'genesis_set'> | undefined
    getMetadata: () => ICheckSigninTransformedOptions<FE> | undefined
    hasFeature: (feature: FE) => boolean
    signin: (url: string, headers?: Record<string, string> | undefined) => Promise<ISigninResponse<FE>>
    isTeamLeader: () => boolean
    getFeatures: () => FE[] | undefined
    /**
     *
     * @deprecated use dispatchLogoutEvent instead
     */
    signoutAuth: () => void
    dispatchLogoutEvent: () => void
    /**
     *
     * @deprecated use getCachedJwt instead
     */
    getJwtTokenAsync: () => Promise<string | undefined>
    getOpenReplay: () => IOpenReplay | undefined
    /**
     * @deprecated use registerCallbackOnSrvAuthEvents directly
     */
    registerOnJwtChanges: <Key_1 extends 'logout_event' | 'jwt_changed' | 'customer_changed'>(
        event: Key_1,
        callback: (
            val: {
                jwt_changed?: Omit<ICheckSigninOptions<any>, 'features'>
                logout_event: { device?: 'TRUSTED' | 'UNTRUSTED' }
                customer_changed: {}
            }[Key_1],
        ) => void,
    ) => {
        unregister: () => void
    }
    registerCallbackOnSrvAuthEvents: <Key_1 extends 'logout_event' | 'jwt_changed' | 'customer_changed'>(
        event: Key_1,
        callback: (
            val: {
                jwt_changed?: ICheckSigninOptions<any>
                logout_event: { device?: 'TRUSTED' | 'UNTRUSTED' }
                customer_changed: {}
            }[Key_1],
        ) => void,
    ) => {
        unregister: () => void
    }
    getUserId: () => string | undefined
    getJwtToken: () => string
    accessTokenHasExpired: () => boolean
}
declare global {
    interface Window {
        __GENERATE_ENV_CONFIGS_BINDINGS__?: {
            /**
             * @deprecated shall be removed at next major release do not use this anymore not need
             */
            fetchConfigsReg: Record<string, () => unknown>
            EnvConfigsFnReg: Record<string, () => unknown>
            EnvConfigsFn?: () => unknown
        }
        __ASMA_clearCacheDataCalled__: boolean

        __ASMA__THEME__?: {
            getTheme: () => string
            setTheme: (theme: string) => void
        }
        rawWindow?: typeof window
        __ENV?: Record<string, string>
        __ENV_MICRO: {
            [key: string]: Record<string, string>
        }
        __MICROAPP_REGISTRY?: {
            name: string
            entry: string
            container: string
            loader: (loading: boolean) => void
            activeRule: string
        }[]
        __ASMA__SHELL__?: {
            openreplay_configs?: IOpenReplay
            openreplay_object?: IGlobalOpenReplay
            history?: History
            auth_bindings?: IAuthBindings<any> //IGenerateSRVAuthBindings
            isLogged?: () => boolean
            logoutUser?: () => void
            //logoutMfes?: (() => void)[]
        }

        _env_cloud?: Record<'adopus' | 'adcuris', Record<string, string>>
        _srvUrls?: Record<string, string>
        /**
         * @deprecated
         * DONT'T USE THIS FIELD ANYMORE
         * WILL BE REMOVED AT NEXT MAJOR RELEASE
         */
        isLogged: boolean
        /**
         * @warning
         * In MicroApps use window.__ASMA__SHELL__.logoutUser
         */
        logoutUser: () => void
        wsConnection: any
        __asma_development_environment_to_operate__?: 'dev' | 'test' | 'stage' | 'prod'
    }
}

export const history = getHistory()

export { type History, createBrowserHistory }

function getHistory() {
    if (realWindow.__ASMA__SHELL__?.history) {
        return realWindow.__ASMA__SHELL__.history
    }

    const history = createBrowserHistory()

    realWindow.__ASMA__SHELL__ = {
        ...realWindow.__ASMA__SHELL__,
        history,
    }

    return history
}
