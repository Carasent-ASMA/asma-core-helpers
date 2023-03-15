import { checkForRegisteredSubdomain } from './checkForRegisteredSubdomains';
import { clearCacheData } from './clearCacheData';
import { EnvConfigsFnInternal, fetchConfigsInternal } from './generateEnvConfigsBindings';
import { getCachedJwtInternal } from './generateSrvAuthBindings';
import { initiatieIDBListenersOnMstSnaphsots } from './InitializeIDBListenersOnMstSnapshots';
/**
 *
 * @imporant make sure this method allways is called first when startsFe() on both on child and shell apps
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
//# sourceMappingURL=initASMAAppVitals.js.map