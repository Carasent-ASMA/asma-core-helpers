import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains';
import { clearCacheData } from './clearCacheData';
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings';
import { getCachedJwtInternal } from './generateSrvAuthBindings';
export async function initASMAAppVitals({ authenticated, is_child_app = false, subdomain_check, setLoadMicroApp, }) {
    /**
     * !!!ORDER IMPORTANT!!!
     * EnvConfigsFn from EnvCongigs.ts
     * setLoadMicroApp from asma-qiankun-react-loader
     * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
     * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
     */
    await fetchConfigsInternal();
    /**
     * //TODO One need to make an context aware cache clear
     * Maybe to add indexes on subapps when initiating and cleaning apps?
     */
    !is_child_app && (await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION));
    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT);
    let registeredSubdomain = true;
    if (!is_child_app && subdomain_check) {
        const [registeredSubdomain1] = await checkForRegisteredSubdomain({
            ...subdomain_check,
            service: subdomain_check.service,
            authenticated,
        });
        registeredSubdomain = registeredSubdomain1;
        authenticated() && (await getCachedJwtInternal());
    }
    return [registeredSubdomain];
}
//# sourceMappingURL=initASMAAppVitals.js.map