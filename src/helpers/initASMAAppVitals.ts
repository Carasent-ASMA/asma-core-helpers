import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains'
import { clearCacheData } from './clearCacheData'
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings'
import { getCachedJwtInternal } from './generateSrvAuthBindings'

/**
 *
 * @imporant make sure this method allways is called first when startsFe() on both on child and shell apps
 */
/* @__PURE__ */
export async function initASMAAppVitals(props: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    is_child_app: true
    authenticated: () => boolean
}): Promise<[registeredSubdomain: true]>
export async function initASMAAppVitals(props: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    is_child_app: false
    authenticated: () => boolean
    subdomain_check: {
        redirect_if_not_exists?: boolean
        setSelectedCustomer?: (customer_id: string) => void
        logos: { fretexLogo: string; carasentLogo: string }
        service: 'app-shell' | 'app-advoca' | 'advoca-portal'
    }
}): Promise<[registeredSubdomain: boolean]>
export async function initASMAAppVitals({
    authenticated,
    is_child_app = false,
    subdomain_check,
    setLoadMicroApp,
}: {
    /**
     * //TODO invesigate how to internalyze this variable
     * use this method from asma-qiankun-react-loader
     */
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    is_child_app?: boolean
    /**
     * //TODO invesigate how to internalyze this variable
     * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is awailable
     */
    authenticated: () => boolean
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
     * EnvConfigsFn from EnvCongigs.ts
     * setLoadMicroApp from asma-qiankun-react-loader
     * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
     * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
     */
    await fetchConfigsInternal()

    /**
     * //TODO One need to make an context aware cache clear
     * Maybe to add indexes on subapps when initiating and cleaning apps?
     */
    !is_child_app && (await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION))

    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT)

    let registeredSubdomain = true

    if (!is_child_app && subdomain_check) {
        const [registeredSubdomain1] = await checkForRegisteredSubdomain({
            ...subdomain_check,
            service: subdomain_check.service,
            authenticated,
        })

        registeredSubdomain = registeredSubdomain1

        authenticated() && (await getCachedJwtInternal())
    }

    return [registeredSubdomain] as [registeredSubdomain: boolean]
}
