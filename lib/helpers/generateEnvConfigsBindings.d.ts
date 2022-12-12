import type { EnvironmentsUrls } from './EnvironmentsUrls';
interface IBasicEnv {
    DEVELOPMENT: boolean;
    ENVIRONMENT_TO_OPERATE: string;
    ADVOCA_ACCESS_URL?: string;
}
type IEnvironmentUrls = typeof EnvironmentsUrls.local;
type IKeyEnvironmentUrls = keyof IEnvironmentUrls;
type ISrvKeysTransformToWs<T> = T extends `SRV_${infer K}` ? `SRV_${K}_WS` : never;
export declare function generateEnvConfigsBindings<T extends IBasicEnv, K extends (keyof T | IKeyEnvironmentUrls | ISrvKeysTransformToWs<keyof T | IKeyEnvironmentUrls>) & string, S>(envs_import: Promise<{
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
    } & Record<"SRV_DIRECTORY_WS" | "SRV_CALENDAR_WS" | "SRV_PROXY_OLD_WS" | "SRV_PROXY_OLD_HELSE_WS" | "SRV_PROXY_OLD_WEB_WS" | "SRV_STORAGE_WS" | "SRV_CHAT_WS" | "SRV_CONNECTOR_WS" | "SRV_ARTIFACT_WS" | "SRV_ADVOCA_WS" | "SRV_PROXY_WS" | "SRV_NOTIFICATION_WS" | "SRV_AO_DIRECTORY_WS" | ISrvKeysTransformToWs<keyof T>, string>, K extends ("SRV_DIRECTORY" | "SRV_CALENDAR" | "SRV_PROXY_OLD" | "SRV_PROXY_OLD_HELSE" | "SRV_PROXY_OLD_WEB" | "SRV_STORAGE" | "SRV_CHAT" | "SRV_CONNECTOR" | "SRV_ARTIFACT" | "SRV_ADVOCA" | "SRV_PROXY" | "SRV_NOTIFICATION" | "SRV_AO_DIRECTORY" | keyof T | "SRV_DIRECTORY_WS" | "SRV_CALENDAR_WS" | "SRV_PROXY_OLD_WS" | "SRV_PROXY_OLD_HELSE_WS" | "SRV_PROXY_OLD_WEB_WS" | "SRV_STORAGE_WS" | "SRV_CHAT_WS" | "SRV_CONNECTOR_WS" | "SRV_ARTIFACT_WS" | "SRV_ADVOCA_WS" | "SRV_PROXY_WS" | "SRV_NOTIFICATION_WS" | "SRV_AO_DIRECTORY_WS" | ISrvKeysTransformToWs<keyof T>) & string ? K : never> & S;
    fetchConfigs: () => Promise<void>;
};
export {};
//# sourceMappingURL=generateEnvConfigsBindings.d.ts.map