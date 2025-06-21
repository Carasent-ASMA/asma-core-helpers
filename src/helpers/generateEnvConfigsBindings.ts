import { realWindow } from '..'
import { httpToWs } from './Config.js'
import { EnvironmentsUrls1 } from './EnvironmentsUrls.js'
import { uuid4 } from './generateUUID4.js'

interface IBasicEnv {
    DEVELOPMENT?: boolean
    ENVIRONMENT_TO_OPERATE?: string
    ADVOCA_ACCESS_URL?: string

    OPENREPLAY_ENABLE?: boolean
    OPENREPLAY_PROJECT_KEY?: string

    OPENREPLAY_TRACKER_PROFILER?: boolean
    OPENREPLAY_TRACKER_MOBX?: boolean
    OPENREPLAY_TRACKER_GRAPHQL?: boolean
    OPENREPLAY_LIVE_ASSIST?: boolean
    OPENREPLAY_ENABLED_CUSTOMERS?: string[]
}

type IEnvironmentUrls = ReturnType<typeof EnvironmentsUrls1>

export type IKeyEnvironmentUrls = keyof IEnvironmentUrls

type StartsWith<T, U extends string> = T extends `${U}${infer _}` ? T : never

type SRVKeys<T> = {
    [K in keyof T as StartsWith<K & string, 'SRV_'>]: T[K]
}

export type IEnvironmentUrlsGenQLOnly = SRVKeys<IEnvironmentUrls> /* Omit<
    IEnvironmentUrls,
    'SRV_PROXY_OLD' | 'SRV_PROXY_OLD_HELSE' | 'SRV_PROXY_OLD_WEB' | 'SRV_ADVOCA'
> */

//type ISrvKeysTransformToWs<T> = T extends `SRV_${infer K}` ? `SRV_${K}_WS` : never

//type IKeyEnvironmentUrlsWs = `${IKeyEnvironmentUrls}_WS`

const EnvConfigsFnInstanceId = uuid4()

/**
 *
 *  For internal use only (inside asma-helpers)
 */

export function EnvConfigsFnInternal() {
    const EnvConfigsFn = realWindow.__GENERATE_ENV_CONFIGS_BINDINGS__?.EnvConfigsFnReg[EnvConfigsFnInstanceId]

    if (!EnvConfigsFn) {
        throw new Error(
            'EnvConfigsFn is not defined! please make sure that generateEnvConfigsBindings is called before EnvConfigsFn',
        )
    }
    return EnvConfigsFn() as {
        CACHE_VERSION: string
        SRV_AUTH?: string
        CDN_ASMA_BASE_URL?: string
    } & IEnvironmentUrls &
        IBasicEnv
}

export function generateEnvConfigsBindings<
    T extends IBasicEnv,
    K extends (
        | keyof T
        | Exclude<IKeyEnvironmentUrls, 'SRV_AO_WRAPPER'>
    ) /* | ISrvKeysTransformToWs<keyof T | IKeyEnvironmentUrls> */ &
        string,
    S,
>(envs_import: { envs: T }, required_envs: K[], static_env: S, adcuris_subdomains?: string[]) {
    type IEnvConfigs = T & IEnvironmentUrls /* & Record<ISrvKeysTransformToWs<keyof T | IKeyEnvironmentUrls>, string> */

    let env_vars = {} as T

    let envConfigs = {} as Pick<IEnvConfigs, K extends keyof IEnvConfigs & string ? K : never> & S

    let envUrls = EnvironmentsUrls1(adcuris_subdomains)

    function EnvConfigsFn() {
        if (Object.keys(envConfigs).length > 0) {
            return envConfigs
        }

        if (Object.keys(env_vars).length === 0) {
            console.error(
                'Env variables not loaded! \n Possible reasons: \n 1) You have a called EnvConfigsFn() before promises inside fetchConfigs() was resolved. \n This happens usually when one call EnvConfigsFn() on top level of a module',
            )
            return envConfigs
        }

        envConfigs = required_envs.reduce((acc, curr) => {
            if (!curr.endsWith('_WS')) {
                const field = env_vars[curr as keyof T] ?? envUrls[curr as IKeyEnvironmentUrls]

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
                    console.warn(`No URL found for ${key}`)
                }
            }

            return acc
        }, envConfigs)

        envConfigs = { ...envConfigs, ...static_env }

        return envConfigs
    }

    const envs = envs_import.envs

    env_vars = { ...envUrls, ...envs }

    realWindow.__GENERATE_ENV_CONFIGS_BINDINGS__ = realWindow.__GENERATE_ENV_CONFIGS_BINDINGS__ || {
        EnvConfigsFnReg: {},
        /**
         * @deprecated shall be removed in next major version
         */
        fetchConfigsReg: {},
    }

    realWindow.__GENERATE_ENV_CONFIGS_BINDINGS__.EnvConfigsFnReg[EnvConfigsFnInstanceId] = EnvConfigsFn

    return { EnvConfigsFn }
}
