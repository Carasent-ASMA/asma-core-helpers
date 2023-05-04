import { type History, createBrowserHistory } from 'history'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
export {}

declare global {
    interface Window {
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
            history?: History
            auth_bindings?: {
                isJwtValid: () => boolean
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
    }
}

export const history = window.__ASMA__SHELL__?.history || createBrowserHistory()

export { type History, createBrowserHistory }
