/**
 *
 * @imporant make sure this method allways is called first when startsFe() on both on child and shell apps
 */
export declare function initASMAAppVitals({ authenticated, is_child_app, subdomain_check, setLoadMicroApp, }: {
    /**
     * //TODO invesigate how to internalyze this variable
     * use this method from asma-qiankun-react-loader
     */
    setLoadMicroApp(dev_mode: boolean): Promise<void>;
    is_child_app?: boolean;
    /**
     * //TODO invesigate how to internalyze this variable
     * add qiankunWindow.__POWERED_BY_QIANKUN__ there where qiankunWindow is awailable
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