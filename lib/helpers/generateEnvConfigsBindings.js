import { httpToWs } from './Config';
export function generateEnvConfigsBindings(envs_import, required_envs, static_env) {
    let env_vars = {};
    let envConfigs = {};
    let envUrls;
    function EnvConfigsFn() {
        if (Object.keys(envConfigs).length > 0) {
            return envConfigs;
        }
        envConfigs = required_envs.reduce((acc, curr) => {
            if (!curr.endsWith('_WS')) {
                const field = env_vars[curr] || (envUrls === null || envUrls === void 0 ? void 0 : envUrls[curr]);
                // @ts-ignore
                acc[curr] = field;
            }
            else {
                const key = curr.replace('_WS', '');
                const field = httpToWs(
                //@ts-ignore
                env_vars[key] || (envUrls === null || envUrls === void 0 ? void 0 : envUrls[key]) || '');
                if (field) {
                    // @ts-ignore
                    acc[curr] = field;
                }
                else {
                    console.warn(`No URL found for ${String(curr)}`);
                }
            }
            return acc;
        }, envConfigs);
        envConfigs = { ...envConfigs, ...static_env };
        return envConfigs;
    }
    async function fetchConfigs() {
        const envs = (await envs_import).envs;
        env_vars = envs;
        if (env_vars.DEVELOPMENT) {
            envUrls = (await import('./EnvironmentsUrls')).default(env_vars.ENVIRONMENT_TO_OPERATE);
        }
    }
    return { EnvConfigsFn, fetchConfigs };
}
//# sourceMappingURL=generateEnvConfigsBindings.js.map