import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains'
import { clearCacheData } from './clearCacheData'
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings'
import { getCachedJwtInternal, isJwtValidInternal, registerCallbackOnSrvAuthEvents } from './generateSrvAuthBindings'
import { registerOpenReplay } from './registerOpenReplay'

/**
 *
 * @important make sure this method always is called first when startsFe() on both on child and shell apps
 */
/* @__PURE__ */

export async function initASMAAppVitals({
    onChangeAuthenticated,
    is_child_app = false,
    subdomain_check,
    setLoadMicroApp,
}: {
    /**
     * //TODO investigate how to internalize this variable
     * use this method from asma-qiankun-react-loader
     */
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    is_child_app?: boolean
    /**
     * //TODO investigate how to internalize this variable
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
         * //TODO temporary solution need to be fetched logos dynamically from srv-auth (origin service is srv-storage or srv-directory)
         */
        logos: { fretexLogo: string; carasentLogo: string }
        /**
         * temporary solution need to be removed after theming will be implemented in all app-shells (app-shell, app-advoca, advoca-portal)
         */
        service: 'app-shell' | 'app-advoca' | 'advoca-portal'
    }
}) {
    /**
     * !!!ORDER IMPORTANT!!!
     * EnvConfigsFn from EnvConfigs.ts
     * setLoadMicroApp from asma-qiankun-react-loader
     * mst_stores_toPersist - array of mst stores that should be persisted in indexedDB
     * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
     */
    await fetchConfigsInternal()

    if (!is_child_app) {
        registerOpenReplay()

        await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION)
    }
    registerCallbackOnSrvAuthEvents('jwt_changed', () => {
        onChangeAuthenticated(isJwtValidInternal())
    })

    await getCachedJwtInternal()
    /**
     * //TODO One need to make an context aware cache clear
     * Maybe to add indexes on subapps when initiating and cleaning apps?
     */
    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT)

    let registeredSubdomain = true

    if (!is_child_app) {
        if (subdomain_check) {
            const [registeredSubdomain1] = await checkForRegisteredSubdomain({
                ...subdomain_check,
                authenticated: isJwtValidInternal,
            })

            registeredSubdomain = registeredSubdomain1
        }
    }

    return [registeredSubdomain] as [registeredSubdomain: boolean]
}
