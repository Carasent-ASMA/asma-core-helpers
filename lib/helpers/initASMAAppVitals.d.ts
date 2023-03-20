/**
 *
 * @imporant make sure this method allways is called first when startsFe() on both on child and shell apps
 */
export declare function initASMAAppVitals(props: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>;
    is_child_app: true;
    authenticated: () => boolean;
}): Promise<[registeredSubdomain: true]>;
export declare function initASMAAppVitals(props: {
    setLoadMicroApp(dev_mode: boolean): Promise<void>;
    is_child_app: false;
    authenticated: () => boolean;
    subdomain_check: {
        redirect_if_not_exists?: boolean;
        setSelectedCustomer?: (customer_id: string) => void;
        logos: {
            fretexLogo: string;
            carasentLogo: string;
        };
        service: 'app-shell' | 'app-advoca' | 'advoca-portal';
    };
}): Promise<[registeredSubdomain: boolean]>;
//# sourceMappingURL=initASMAAppVitals.d.ts.map