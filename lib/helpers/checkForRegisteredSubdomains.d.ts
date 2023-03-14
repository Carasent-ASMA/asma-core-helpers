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