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
export async function initAppShellVitals(fns: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>
    mst_stores_toPersisit: Object[]
    data_for_registered_subdomain_check: {
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
         * whenether user is authenticated or not
         */
        authenticated: () => boolean
        /**
         * temporary solution need to be removed after theming will be implemented in all app-shells (app-shell, app-advoca, advoca-portal)
         */
        service: 'app-shell' | 'app-advoca' | 'advoca-portal'
    }
}) {
    await fetchConfigsInternal()

    await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION)

    await fns.setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT)

    const promises = fns.mst_stores_toPersisit.map((store) => initiatieIDBListenersOnMstSnaphsots(store))

    await Promise.allSettled(promises)

    const [registeredSubdomain] = await checkForRegisteredSubdomain(fns.data_for_registered_subdomain_check)

    fns.data_for_registered_subdomain_check.authenticated() && getCachedJwtInternal()

    return [registeredSubdomain] as [registeredSubdomain: boolean]
}
