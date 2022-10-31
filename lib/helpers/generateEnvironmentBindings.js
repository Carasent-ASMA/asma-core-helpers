export function generateEnvConfigsBindings(envs_import, required_vars, static_env) {
    let env_vars = {};
    let envConfigs = {};
    let envUrls;
    function EnvConfigsFn() {
        if (Object.keys(envConfigs).length > 0) {
            return envConfigs;
        }
        envConfigs = required_vars.reduce((acc, curr) => {
            const field = env_vars[curr] || (envUrls === null || envUrls === void 0 ? void 0 : envUrls[curr]);
            // @ts-ignore
            acc[curr] = field;
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
//# sourceMappingURL=generateEnvironmentBindings.js.map