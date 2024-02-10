import { httpToWs } from './Config'
import type { EnvironmentsUrls } from './EnvironmentsUrls'
import { uuid4 } from './generateUUID4'

interface IBasicEnv {
    DEVELOPMENT: boolean
    ENVIRONMENT_TO_OPERATE: string
    ADVOCA_ACCESS_URL?: string

    OPENREPLAY_ENABLE?: boolean
    OPENREPLAY_PROJECT_KEY?: string

    OPENREPLAY_TRACKER_PROFILER?: boolean
    OPENREPLAY_TRACKER_MOBX?: boolean
    OPENREPLAY_TRACKER_GRAPHQL?: boolean
    OPENREPLAY_LIVE_ASSIST?: boolean
    OPENREPLAY_ENABLED_CUSTOMERS?: string[]
}

type IEnvironmentUrls = typeof EnvironmentsUrls.local

export type IKeyEnvironmentUrls = keyof IEnvironmentUrls

export type IEnvironmentUrlsGenQLOnly = Omit<
    IEnvironmentUrls,
    'SRV_PROXY_OLD' | 'SRV_PROXY_OLD_HELSE' | 'SRV_PROXY_OLD_WEB' | 'SRV_ADVOCA'
>

//type ISrvKeysTransformToWs<T> = T extends `SRV_${infer K}` ? `SRV_${K}_WS` : never

//type IKeyEnvironmentUrlsWs = `${IKeyEnvironmentUrls}_WS`
declare global {
    interface Window {
        __GENERATE_ENV_CONFIGS_BINDINGS__?: {
            fetchConfigsReg: Record<string, () => Promise<void>>
            EnvConfigsFnReg: Record<string, () => unknown>
        }
    }
}
const fetchConfigsInstanceId = uuid4()
const EnvConfigsFnInstanceId = uuid4()
console.info('fetchConfigsInstanceId', fetchConfigsInstanceId)
console.info('EnvConfigsFnInstanceId', EnvConfigsFnInstanceId)

/**
 *
 * for internal use only (inside asma-helpers)
 */
/* @__PURE__ */
export async function fetchConfigsInternal() {
    const fetchConfigs = window.__GENERATE_ENV_CONFIGS_BINDINGS__?.fetchConfigsReg[fetchConfigsInstanceId]

    if (!fetchConfigs) {
        console.error(
            'fetchConfigs is not defined! please make sure that generateEnvConfigsBindings is called before fetchConfigs',
        )
    }

    return fetchConfigs?.()
}

/**
 *
 *  For internal use only (inside asma-helpers)
 */
/* @__PURE__ */
export function EnvConfigsFnInternal() {
    const EnvConfigsFn = window.__GENERATE_ENV_CONFIGS_BINDINGS__?.EnvConfigsFnReg[EnvConfigsFnInstanceId]
    if (!EnvConfigsFn) {
        throw new Error(
            'EnvConfigsFn is not defined! please make sure that generateEnvConfigsBindings is called before EnvConfigsFn',
        )
    }
    return EnvConfigsFn() as {
        CACHE_VERSION: string
        SRV_AUTH: string
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
>(envs_import: Promise<{ envs: T }>, required_envs: K[], static_env: S) {
    type IEnvConfigs = T & IEnvironmentUrls /* & Record<ISrvKeysTransformToWs<keyof T | IKeyEnvironmentUrls>, string> */

    let env_vars = {} as T

    let envConfigs = {} as Pick<IEnvConfigs, K extends keyof IEnvConfigs & string ? K : never> & S

    let envUrls: IEnvironmentUrls | undefined

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
                const field = env_vars[curr as keyof T] ?? envUrls?.[curr as IKeyEnvironmentUrls]

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

    async function fetchConfigs() {
        const envs = (await envs_import).envs

        env_vars = envs

        if (env_vars.DEVELOPMENT) {
            envUrls = (await import('./EnvironmentsUrls')).default(env_vars.ENVIRONMENT_TO_OPERATE)
        }
    }
    window.__GENERATE_ENV_CONFIGS_BINDINGS__ = window.__GENERATE_ENV_CONFIGS_BINDINGS__ || {
        EnvConfigsFnReg: {},
        fetchConfigsReg: {},
    }

    window.__GENERATE_ENV_CONFIGS_BINDINGS__.fetchConfigsReg[fetchConfigsInstanceId] = fetchConfigs
    window.__GENERATE_ENV_CONFIGS_BINDINGS__.EnvConfigsFnReg[EnvConfigsFnInstanceId] = EnvConfigsFn

    return { EnvConfigsFn, fetchConfigs }
}
