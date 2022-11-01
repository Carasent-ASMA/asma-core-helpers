import type { EnvironmentsUrls } from './EnvironmentsUrls';
interface IBasicEnv {
    DEVELOPMENT: boolean;
    ENVIRONMENT_TO_OPERATE: string;
    ADVOCA_ACCESS_URL?: string;
}
declare type IEnvironmentUrls = typeof EnvironmentsUrls.local;
declare type IKeyEnvironmentUrls = keyof IEnvironmentUrls;
declare type IKeyEnvironmentUrlsWs = `${IKeyEnvironmentUrls}_WS`;
export declare function generateEnvConfigsBindings<T extends IBasicEnv, K extends (keyof T | IKeyEnvironmentUrls | IKeyEnvironmentUrlsWs) & string, S>(envs_import: Promise<{
    envs: T;
}>, required_envs: K[], static_env: S): {
    EnvConfigsFn: () => Pick<T & {
        SRV_DIRECTORY: string;
        SRV_CALENDAR: string;
        SRV_PROXY_OLD: string;
        SRV_STORAGE: string;
        SRV_CHAT: string;
        SRV_CONNECTOR: string;
        SRV_ARTIFACT: string;
        SRV_ADVOCA: string;
        SRV_PROXY: string;
        SRV_NOTIFICATION: string;
        SRV_AO_DIRECTORY: string;
    }, K extends "SRV_DIRECTORY" | "SRV_CALENDAR" | "SRV_PROXY_OLD" | "SRV_STORAGE" | "SRV_CHAT" | "SRV_CONNECTOR" | "SRV_ARTIFACT" | "SRV_ADVOCA" | "SRV_PROXY" | "SRV_NOTIFICATION" | "SRV_AO_DIRECTORY" | keyof T ? K : never> & S;
    fetchConfigs: () => Promise<void>;
};
export {};
//# sourceMappingURL=generateEnvConfigsBindings.d.ts.map