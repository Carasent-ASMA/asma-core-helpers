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
export async function initASMAAppVitals({ 
/**
 * //TODO invesigate how to internalyze this variable
 * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is awailable
 */
authenticated, is_child_app = false, subdomain_check, mst_stores_to_persisit, setLoadMicroApp, }) {
    await fetchConfigsInternal();
    await clearCacheData(EnvConfigsFnInternal().CACHE_VERSION);
    await setLoadMicroApp(EnvConfigsFnInternal().DEVELOPMENT);
    const promises = mst_stores_to_persisit.map((store) => initiatieIDBListenersOnMstSnaphsots(store));
    await Promise.allSettled(promises);
    let registeredSubdomain = true;
    if (!is_child_app) {
        const [registeredSubdomain1] = await checkForRegisteredSubdomain({ ...subdomain_check, authenticated });
        registeredSubdomain = registeredSubdomain1;
        authenticated() && (await getCachedJwtInternal());
    }
    return [registeredSubdomain];
}
//# sourceMappingURL=initAppVitals.js.map