import { type History, createBrowserHistory } from 'history'
import type { ICheckForRegisteredSubdomainResponse, IOpenReplay } from './helpers/generateSrvAuthBindings'
import type { IGlobalOpenReplay } from './helpers/openReplayObject'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
export {}

/**
 *  declare optional rawWindow  which is added by micro-app framework in child apps
 * when is used @micro-zoe/micro-app package
 */

export const realWindow = window.rawWindow || window
declare global {
    interface Window {
        __GENERATE_ENV_CONFIGS_BINDINGS__?: {
            /**
             * @deprecated remove in next major version this does nothing anymore
             */
            fetchConfigsReg: Record<string, () => void>
            EnvConfigsFnReg: Record<string, () => unknown>
            EnvConfigsFn?: () => unknown
        }
        __ASMA_clearCacheDataCalled__: boolean

        __ASMA__THEME__?: {
            getTheme: () => string
            setTheme: (theme: string) => void
        }
        rawWindow?: Window
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
            auth_bindings?: {
                isJwtValid: () => boolean
                getConnector: () => string | undefined
                getCachedJwt: () => Promise<string | undefined>
                srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<R>
                setReqConfig: <T = unknown>(
                    data?: T | undefined,
                    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream',
                ) => Promise<{
                    data: T | undefined
                    responseType: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | undefined
                    headers: Record<string, string>
                }>
                getSrvUrls: () => Record<'ao_wrapper' | 'connector', string> | undefined
                checkForRegisteredSubdomain: <FE = unknown>() => Promise<
                    Omit<ICheckForRegisteredSubdomainResponse<FE>, 'features'>
                >
            } //IGenerateSRVAuthBindings
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

export const history = realWindow.__ASMA__SHELL__?.history || createBrowserHistory()

export { type History, createBrowserHistory }
