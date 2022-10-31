import type { EnvironmentsUrls } from './EnvironmentsUrls';
interface IBasicEnv {
    DEVELOPMENT: boolean;
    ENVIRONMENT_TO_OPERATE: string;
}
declare type IEnvironmentUrls = typeof EnvironmentsUrls.local;
declare type IKeyEnvironmentUrls = keyof IEnvironmentUrls;
export declare function generateEnvConfigsBindings<T extends IBasicEnv, K extends keyof T | IKeyEnvironmentUrls, S>(envs_import: Promise<{
    envs: T;
}>, required_vars: K[], static_env: S): {
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
    }, K> & S;
    fetchConfigs: () => Promise<void>;
};
export {};
//# sourceMappingURL=generateEnvConfigsBindings.d.ts.map