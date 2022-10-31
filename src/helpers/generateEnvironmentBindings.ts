import type { EnvironmentsUrls } from "./EnvironmentsUrls"

interface IBasicEnv {
    DEVELOPMENT: boolean
    ENVIRONMENT_TO_OPERATE: string
}

type IEnvironmentUrls = typeof EnvironmentsUrls.local

type IKeyEnvironmentUrls = keyof IEnvironmentUrls

export function generateEnvConfigsBindings<T extends IBasicEnv, K extends keyof T | IKeyEnvironmentUrls, S>(
    envs_import: Promise<{ envs: T }>,
    required_vars: K[],
    static_env: S,
) {
    type IEnvConfigs = T & IEnvironmentUrls

    let env_vars = {} as T

    let envConfigs = {} as Pick<IEnvConfigs, K> & S

    let envUrls: IEnvironmentUrls | undefined

    function EnvConfigsFn() {
        if (Object.keys(envConfigs).length > 0) {
            return envConfigs
        }

        envConfigs = required_vars.reduce((acc, curr) => {
            const field = env_vars[curr as keyof T] || envUrls?.[curr as IKeyEnvironmentUrls]

            // @ts-ignore
            acc[curr] = field

            return acc
        }, envConfigs)

        envConfigs = { ...envConfigs, ...static_env }

        return envConfigs
    }

    async function fetchConfigs() {
        const envs = (await envs_import).envs

        env_vars = envs

        if (env_vars.DEVELOPMENT) {
            envUrls = (await import('./EnvironmentsUrls')).default(env_vars.ENVIRONMENT_TO_OPERATE)
        }
    }

    return { EnvConfigsFn, fetchConfigs }
}