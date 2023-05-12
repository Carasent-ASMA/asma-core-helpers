import type { EnvironmentsUrls } from './EnvironmentsUrls';
interface IBasicEnv {
    DEVELOPMENT: boolean;
    ENVIRONMENT_TO_OPERATE: string;
    ADVOCA_ACCESS_URL?: string;
    OPENREPLAY_PROJECT_KEY?: string;
}
type IEnvironmentUrls = typeof EnvironmentsUrls.local;
export type IKeyEnvironmentUrls = keyof IEnvironmentUrls;
export type IEnvironmentUrlsGenQLOnly = Omit<IEnvironmentUrls, 'SRV_PROXY_OLD' | 'SRV_PROXY_OLD_HELSE' | 'SRV_PROXY_OLD_WEB' | 'SRV_ADVOCA'>;
declare global {
    interface Window {
        __GENERATE_ENV_CONFIGS_BINDINGS__?: {
            fetchConfigsReg: Record<string, () => Promise<void>>;
            EnvConfigsFnReg: Record<string, () => unknown>;
        };
    }
}
/**
 *
 * for internal use only (inside asma-helpers)
 */
export declare function fetchConfigsInternal(): Promise<void | undefined>;
/**
 *
 *  For internal use only (inside asma-helpers)
 */
export declare function EnvConfigsFnInternal(): {
    CACHE_VERSION: string;
    SRV_AUTH: string;
} & {
    SRV_DIRECTORY: string;
    SRV_CALENDAR: string;
    SRV_PROXY_OLD: string;
    SRV_PROXY_OLD_HELSE: string;
    SRV_PROXY_OLD_WEB: string;
    SRV_STORAGE: string;
    SRV_CHAT: string;
    SRV_CONNECTOR: string;
    SRV_ARTIFACT: string;
    SRV_ADVOCA: string;
    SRV_PROXY: string;
    SRV_NOTIFICATION: string;
    SRV_AO_DIRECTORY: string;
    SRV_AO_WRAPPER: string;
} & IBasicEnv;
export declare function generateEnvConfigsBindings<T extends IBasicEnv, K extends (keyof T | Omit<IKeyEnvironmentUrls, 'SRV_AO_WRAPPER'>) & string, S>(envs_import: Promise<{
    envs: T;
}>, required_envs: K[], static_env: S): {
    EnvConfigsFn: () => Pick<T & {
        SRV_DIRECTORY: string;
        SRV_CALENDAR: string;
        SRV_PROXY_OLD: string;
        SRV_PROXY_OLD_HELSE: string;
        SRV_PROXY_OLD_WEB: string;
        SRV_STORAGE: string;
        SRV_CHAT: string;
        SRV_CONNECTOR: string;
        SRV_ARTIFACT: string;
        SRV_ADVOCA: string;
        SRV_PROXY: string;
        SRV_NOTIFICATION: string;
        SRV_AO_DIRECTORY: string;
        SRV_AO_WRAPPER: string;
    }, K extends "SRV_PROXY_OLD" | "SRV_PROXY_OLD_HELSE" | "SRV_PROXY_OLD_WEB" | "SRV_ADVOCA" | "SRV_DIRECTORY" | "SRV_CALENDAR" | "SRV_STORAGE" | "SRV_CHAT" | "SRV_CONNECTOR" | "SRV_ARTIFACT" | "SRV_PROXY" | "SRV_NOTIFICATION" | "SRV_AO_DIRECTORY" | "SRV_AO_WRAPPER" | (keyof T & string) ? K : never> & S;
    fetchConfigs: () => Promise<void>;
};
export {};
//# sourceMappingURL=generateEnvConfigsBindings.d.ts.map