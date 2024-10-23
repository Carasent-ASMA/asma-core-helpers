import type { registry_envs as _registry_envs } from 'asma-qiankun-react-loader/lib/registry/environment-entries'
import {
    checkForRegisteredSubdomain,
    type IResWithSubdomain,
    type IResWithSubdomainOnError,
} from './checkForRegisteredSubdomains'
import { clearCacheData } from './clearCacheData'
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings'
import { getCachedJwtInternal, isJwtValidInternal, registerCallbackOnSrvAuthEvents } from './generateSrvAuthBindings'
import { isNotEmptyObjArr } from './IsNotEmpty'
import { subdomain } from './getSubdomain'
import { realWindow } from '..'
//import { registerOpenReplay } from './registerOpenReplay'

type IInitASMAAppVitalsParams = {
    /**
     * #TODO investigate how to internalize this variable
     * use this method from asma-qiankun-react-loader
     */
    setLoadMicroApp(dev_mode: boolean, registry_urls?: (typeof _registry_envs)['local']): Promise<void>
    is_child_app?: boolean
    /**
     * #TODO investigate how to internalize this variable
     * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is available
     */
    onChangeAuthenticated: (authenticated: boolean) => void
    mst_stores?: object[]
    subdomain_check?: {
        /**
         * redirects to domain if subdomain is not registered
         * ex: https://non-existent.adopus.no -> https://www.adopus.no
         */
        redirect_if_not_exists?: boolean
        setSelectedCustomer?: (customer_id: string) => void
        /**
         * #TODO temporary solution need to be fetched logos dynamically from srv-auth (origin service is srv-storage or srv-directory)
         */
        logos: { fretexLogo: string; carasentLogo: string }
        /**
         * temporary solution need to be removed after theming will be implemented in all app-shells (app-shell, app-advoca, advoca-portal)
         */
        service: 'app-shell' | 'app-advoca' | 'advoca-portal'
    }
}
/**
 *
 * @important make sure this method always is called first when startsFe() on both on child and shell apps
 */
export async function initASMAAppVitals({
    onChangeAuthenticated,
    is_child_app = false,
    subdomain_check,
    setLoadMicroApp,
}: IInitASMAAppVitalsParams): Promise<IResWithSubdomain | IResWithSubdomainOnError | undefined> {
    /**
     * !!!ORDER IMPORTANT!!!
     * EnvConfigsFn from EnvConfigs.ts
     * setLoadMicroApp from asma-qiankun-react-loader
     * mst_stores_toPersist - array of mst stores that should be persisted in indexedDB
     * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
     */

    if (!is_child_app) {
        await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION)
    }
    registerCallbackOnSrvAuthEvents('jwt_changed', () => {
        onChangeAuthenticated(isJwtValidInternal())
    })

    await getCachedJwtInternal()

    //let registeredSubdomain = true
    let resRegisteredSubdomain: IResWithSubdomain | IResWithSubdomainOnError | undefined = undefined
    if (!is_child_app) {
        realWindow.__asma_development_environment_to_operate__ = EnvConfigsFnInternal().ENVIRONMENT_TO_OPERATE /* as
            | 'dev'
            | 'test'
            | 'stage'
            | 'prod' */

        if (subdomain_check) {
            resRegisteredSubdomain = await checkForRegisteredSubdomain()

            if ('props' in resRegisteredSubdomain) {
                appendAsmaLogoLink(resRegisteredSubdomain.props.theme, subdomain_check.logos, subdomain_check.service)
            }
        }
    }

    /**
     *   #TODO: One need to make an context aware cache clear
     * Maybe to add indexes on subapps when initiating and cleaning apps?
     */

    let registry_urls: (typeof _registry_envs)['local'] | undefined = undefined

    if (
        resRegisteredSubdomain &&
        'props' in resRegisteredSubdomain &&
        isNotEmptyObjArr(resRegisteredSubdomain.props.default_app_versions)
    ) {
        const default_app_versions = resRegisteredSubdomain.props!.default_app_versions!

        registry_urls = Object.keys(default_app_versions).reduce((acc, key) => {
            const app_version = default_app_versions[key]

            const base_url = EnvConfigsFnInternal().CDN_ASMA_BASE_URL || '/cdn'

            const app_version_url = `${base_url}/${key}/${app_version}/`

            acc[key] = app_version_url.replace(/\s/g, '')

            return acc
        }, {} as Record<string, string>)
    } else {
        !is_child_app && console.info('No default_app_versions found in resRegisteredSubdomain.props')
    }

    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT, registry_urls as (typeof _registry_envs)['local'])

    return resRegisteredSubdomain
}

const asmaLogoLink = 'asma-logo-link'

function appendAsmaLogoLink(
    theme: string | undefined,
    { carasentLogo, fretexLogo }: { fretexLogo: string; carasentLogo: string },
    service: 'app-shell' | 'advoca-portal' | 'app-advoca',
) {
    if (!theme) {
        console.error('theme is not defined fallback to default')

        if (subdomain === 'fretex') {
            theme = 'fretex'
        } else {
            theme = 'greenish'
        }
    }

    if (service === 'advoca-portal') {
        theme = 'default'
    }

    const body = document.body!

    body.dataset['theme'] = theme

    document.getElementById(asmaLogoLink)?.remove()

    const link = document.createElement('link')

    link.setAttribute('id', asmaLogoLink)

    if (subdomain === 'fretex') {
        document.title = 'Fretex'
        link.setAttribute('href', fretexLogo)
    } else {
        document.title = 'Ad Voca'

        link.setAttribute('href', carasentLogo)
    }

    link.setAttribute('rel', 'icon')

    link.setAttribute('type', 'image/png')

    link.setAttribute('sizes', '32x32')

    document.head.appendChild(link)
}
