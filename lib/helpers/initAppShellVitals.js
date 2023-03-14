import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains';
import { clearCacheData } from './clearCacheData';
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings';
import { getCachedJwtInternal } from './generateSrvAuthBindings';
import { initiatieIDBListenersOnMstSnaphsots } from './InitializeIDBListenersOnMstSnapshots';
/**
 * !!!ORDER IS VERY IMPORTANT!!!
 * EnvConfigsFn from EnvCongigs.ts
 * setLoadMicroApp from asma-qiankun-react-loader
 * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
 * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
 */
export async function initAppShellVitals(fns) {
    await fetchConfigsInternal();
    await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION);
    await fns.setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT);
    const promises = fns.mst_stores_toPersisit.map((store) => initiatieIDBListenersOnMstSnaphsots(store));
    await Promise.allSettled(promises);
    const [registeredSubdomain] = await checkForRegisteredSubdomain(fns.data_for_registered_subdomain_check);
    fns.data_for_registered_subdomain_check.authenticated && getCachedJwtInternal();
    return [registeredSubdomain];
}
//# sourceMappingURL=initAppShellVitals.js.map