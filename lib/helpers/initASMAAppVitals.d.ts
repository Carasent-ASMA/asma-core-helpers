/**
 *
 * @imporant make sure this method allways is called first when startsFe() on both on child and shell apps
 */
export declare function initASMAAppVitals({ 
/**
 * //TODO invesigate how to internalyze this variable
 * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is awailable
 */
authenticated, is_child_app, subdomain_check, mst_stores_to_persisit, setLoadMicroApp, }: {
    /**
     * !!!ORDER IS VERY IMPORTANT!!!
     * EnvConfigsFn from EnvCongigs.ts
     * setLoadMicroApp from asma-qiankun-react-loader
     * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
     * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
     */
    setLoadMicroApp(dev_mode: boolean): Promise<void>;
    is_child_app?: boolean;
    mst_stores_to_persisit: Object[];
    /**
     * whenether user is authenticated or not
     */
    authenticated: () => boolean;
    subdomain_check: {
        /**
         * redirects to domain if subdomain is not registered
         * ex: https://non-existent.adopus.no -> https://www.adopus.no
         */
        redirect_if_not_exists?: boolean;
        setSelectedCustomer?: (customer_id: string) => void;
        /**
         * //TODO temporary solution need to be fetched logos dynamically from srv-auth (origin service is srv-storage or srv-directory)
         */
        logos: {
            fretexLogo: string;
            carasentLogo: string;
        };
        /**
         * temporary solution need to be removed after theming will be implemented in all app-shells (app-shell, app-advoca, advoca-portal)
         */
        service: 'app-shell' | 'app-advoca' | 'advoca-portal';
    };
}): Promise<[registeredSubdomain: boolean]>;
//# sourceMappingURL=initASMAAppVitals.d.ts.map