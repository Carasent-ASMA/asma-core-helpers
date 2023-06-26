import { type History, createBrowserHistory } from 'history';
import type { IOpenReplay } from './helpers/generateSrvAuthBindings';
import type { IGlobalOpenReplay } from './helpers/openReplayObject';
export {};
declare global {
    interface Window {
        __ENV?: Record<string, string>;
        __ENV_MICRO: {
            [key: string]: Record<string, string>;
        };
        __MICROAPP_REGISTRY?: {
            name: string;
            entry: string;
            container: string;
            loader: (loading: boolean) => void;
            activeRule: string;
        }[];
        __ASMA__SHELL__?: {
            openreplay_configs?: IOpenReplay;
            openreplay_object?: IGlobalOpenReplay;
            history?: History;
            auth_bindings?: {
                isJwtValid: () => boolean;
                getConnector: () => string | undefined;
                getCachedJwt: () => Promise<string | undefined>;
                srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<R>;
                setReqConfig: <T = unknown>(data?: T | undefined, responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream') => Promise<{
                    data: T | undefined;
                    responseType: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | undefined;
                    headers: Record<string, string>;
                }>;
                getSrvUrls: () => Record<'ao_wrapper' | 'connector', string> | undefined;
            };
            isLogged?: () => boolean;
            logoutUser?: () => void;
        };
        _env_cloud?: Record<'adopus' | 'adcuris', Record<string, string>>;
        _srvUrls?: Record<string, string>;
        /**
         * @deprecated
         * DONT'T USE THIS FIELD ANYMORE
         * WILL BE REMOVED AT NEXT MAJOR RELEASE
         */
        isLogged: boolean;
        /**
         * @warning
         * In MicroApps use window.__ASMA__SHELL__.logoutUser
         */
        logoutUser: () => void;
        wsConnection: any;
    }
}
export declare const history: History;
export { type History, createBrowserHistory };
//# sourceMappingURL=global.d.ts.map