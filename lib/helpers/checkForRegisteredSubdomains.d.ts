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
export declare function checkForRegisteredSubdomain({ redirect_if_not_exists, setSelectedCustomer, srvAuthGet, logos, authenticated, }: {
    redirect_if_not_exists?: boolean;
    setSelectedCustomer?: (customer_id: string) => void;
    srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>;
    logos: {
        fretexLogo: string;
        carasentLogo: string;
    };
    authenticated: boolean;
}): Promise<[registeredSubdomain: boolean, unregister: () => void]>;
//# sourceMappingURL=checkForRegisteredSubdomains.d.ts.map