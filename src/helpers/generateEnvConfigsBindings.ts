import { httpToWs } from './Config'
import type { EnvironmentsUrls } from './EnvironmentsUrls'

interface IBasicEnv {
    DEVELOPMENT: boolean
    ENVIRONMENT_TO_OPERATE: string
    ADVOCA_ACCESS_URL?: string
}

type IEnvironmentUrls = typeof EnvironmentsUrls.local

type IKeyEnvironmentUrls = keyof IEnvironmentUrls

type IKeyEnvironmentUrlsWs = `${IKeyEnvironmentUrls}_WS`

export function generateEnvConfigsBindings<
    T extends IBasicEnv,
    K extends (keyof T | IKeyEnvironmentUrls | IKeyEnvironmentUrlsWs) & string,
    S,
>(envs_import: Promise<{ envs: T }>, required_envs: K[], static_env: S) {
    type IEnvConfigs = T & IEnvironmentUrls

    let env_vars = {} as T

    let envConfigs = {} as Pick<IEnvConfigs, K extends keyof IEnvConfigs ? K : never> & S

    let envUrls: IEnvironmentUrls | undefined

    function EnvConfigsFn() {
        if (Object.keys(envConfigs).length > 0) {
            return envConfigs
        }

        envConfigs = required_envs.reduce((acc, curr) => {
            if (!curr.endsWith('_WS')) {
                const field = env_vars[curr as keyof T] || envUrls?.[curr as IKeyEnvironmentUrls]
                // @ts-ignore
                acc[curr] = field
            } else {
                const key = curr.replace('_WS', '')
                const field = httpToWs(
                    //@ts-ignore
                    env_vars[key] || envUrls?.[key as IKeyEnvironmentUrls] || '',
                )
                if (field) {
                    // @ts-ignore
                    acc[curr] = field
                } else {
                    console.warn(`No URL found for ${String(curr)}`)
                }
            }

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
