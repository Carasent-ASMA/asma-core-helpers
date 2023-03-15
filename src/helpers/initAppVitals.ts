import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains'
import { clearCacheData } from './clearCacheData'
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings'
import { getCachedJwtInternal } from './generateSrvAuthBindings'
import { initiatieIDBListenersOnMstSnaphsots } from './InitializeIDBListenersOnMstSnapshots'

/**
 * !!!ORDER IS VERY IMPORTANT!!!
 * EnvConfigsFn from EnvCongigs.ts
 * setLoadMicroApp from asma-qiankun-react-loader
 * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
 * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
 */
export async function initAppVitals({
    /**
     * //TODO invesigate how to internalyze this variable
     * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is awailable
     */
    authenticated,
    is_child_app = false,
    subdomain_check,
    mst_stores_to_persisit,
    setLoadMicroApp,
}: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    is_child_app?: boolean
    mst_stores_to_persisit: Object[]
    /**
     * whenether user is authenticated or not
     */
    authenticated: () => boolean
    subdomain_check: {
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
    await fetchConfigsInternal()

    await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION)

    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT)

    const promises = mst_stores_to_persisit.map((store) => initiatieIDBListenersOnMstSnaphsots(store))

    await Promise.allSettled(promises)

    let registeredSubdomain = false

    if (!is_child_app) {
        const [registeredSubdomain1] = await checkForRegisteredSubdomain({ ...subdomain_check, authenticated })

        registeredSubdomain = registeredSubdomain1
    }

    authenticated() && (await getCachedJwtInternal())

    return [registeredSubdomain] as [registeredSubdomain: boolean]
}
