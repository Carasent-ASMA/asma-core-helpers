declare global {
    interface Window {
        __ASMA__THEME__?: {
            getTheme: () => string;
            setTheme: (theme: string) => void;
        };
    }
}
export declare function onThemeChange(callback: (val: {
    theme: string;
}) => void): {
    unregister: () => void;
};
export declare function getTheme(): string;
export declare function setTheme(theme: string): void;
/**
 * !!!ORDER IS VERY IMPORTANT!!!
 * EnvConfigsFn from EnvCongigs.ts
 * setLoadMicroApp from asma-qiankun-react-loader
 * mst_stores_toPersisit - array of mst stores that should be persisted in indexedDB
 * data_for_registered_subdomain_check - data needed to check if subdomain is registered to an exiting tenant in the db
 */
export declare function initAplicationVitals(fns: {
    EnvConfigsFn: () => {
        CACHE_VERSION: string;
        DEVELOPMENT: boolean;
    };
    fetchConfigs(): Promise<void>;
    setLoadMicroApp(dev_mode: boolean): Promise<void>;
    mst_stores_toPersisit: Object[];
    data_for_registered_subdomain_check: {
        redirect_if_not_exists?: boolean;
        setSelectedCustomer?: (customer_id: string) => void;
        srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>;
        logos: {
            fretexLogo: string;
            carasentLogo: string;
        };
        authenticated: boolean;
        service: 'app-shell' | 'app-advoca' | 'advoca-portal';
    };
}): Promise<[registeredSubdomain: boolean]>;
export declare function checkForRegisteredSubdomain({ redirect_if_not_exists, setSelectedCustomer, logos, authenticated, service, }: {
    redirect_if_not_exists?: boolean;
    setSelectedCustomer?: (customer_id: string) => void;
    logos: {
        fretexLogo: string;
        carasentLogo: string;
    };
    authenticated: boolean;
    /**
     * @deprecated one need remove this. Please do not use it in more use cases
     */
    service: 'app-shell' | 'advoca-portal' | 'app-advoca';
}): Promise<[registeredSubdomain: boolean, unregister: () => void]>;
//# sourceMappingURL=checkForRegisteredSubdomains.d.ts.map