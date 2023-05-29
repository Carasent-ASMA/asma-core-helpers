export declare const dispatchSrvAuthEvents: <Key extends "logout_event" | "jwt_changed" | "customer_changed">(event: Key, arg: {
    jwt_changed: {};
    logout_event: {};
    customer_changed: {};
}[Key], shouldPersist?: boolean | undefined) => void, registerCallbackOnSrvAuthEvents: <Key_1 extends "logout_event" | "jwt_changed" | "customer_changed">(event: Key_1, callback: (val: {
    jwt_changed: {};
    logout_event: {};
    customer_changed: {};
}[Key_1]) => void) => {
    unregister: () => void;
};
declare function dispatchLogoutEvent(): void;
/**
 * @generic FeatureEnums - feature_names_enums from asma-genql-directory
 * @generic SrvUrlsEnums - srv_names_enums from asma-genql-directory
 */
export declare function getCachedJwtInternal(): Promise<string | undefined>;
export declare function getConnectorInternal(): string | undefined;
export declare function isJwtValidInternal(): boolean;
export declare function srvAuthGetInternal<R>(url: string, headers?: Record<string, string>): Promise<R>;
export declare function getSrvUrlsInternal(): Record<'ao_wrapper' | 'connector', string> | undefined;
export declare function setReqConfigInternal<T = unknown>(data?: T | undefined, responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream'): Promise<{
    data: T | undefined;
    responseType: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream" | undefined;
    headers: Record<string, string>;
}>;
export type IOpenReplay = {
    enable: boolean;
    live_assist: boolean;
    graphql: boolean;
    mobx: boolean;
    profiler: boolean;
};
export declare function generateSrvAuthBindings<FeatureEnums = never>(logout?: () => void): {
    hasFeature: (featureName: FeatureEnums) => boolean;
    getConnector: () => string | undefined;
    getFeatures: () => Set<FeatureEnums> | undefined;
    isJwtValid: () => boolean;
    signin: (url: string, headers?: Record<string, string>) => Promise<{
        token: string;
        features: FeatureEnums[];
        IOpenReplay?: IOpenReplay | undefined;
        connector?: string | undefined;
        srv_urls: Record<"ao_wrapper" | "connector", string> | undefined;
    }>;
    srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<R>;
    getSrvUrls: () => Record<"ao_wrapper" | "connector", string> | undefined;
    /**
     * @deprecated use dispatchLogoutEvent directly
     */
    signoutAuth: typeof dispatchLogoutEvent;
    dispatchLogoutEvent: typeof dispatchLogoutEvent;
    setReqConfig: <T = unknown>(data?: T | undefined, responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream') => Promise<{
        data: T | undefined;
        responseType: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream" | undefined;
        headers: Record<string, string>;
    }>;
    /**
     * @deprecated use getCachedJwt
     *  */
    getJwtTokenAsync: () => Promise<string | undefined>;
    getCachedJwt: () => Promise<string | undefined>;
    getOpenReplay: () => IOpenReplay | undefined;
    getNewJwtToken: () => Promise<string | undefined>;
    /**
     * @deprecated use registerCallbackOnSrvAuthEvents directly
     */
    registerOnJwtChanges: <Key_1 extends "logout_event" | "jwt_changed" | "customer_changed">(event: Key_1, callback: (val: {
        jwt_changed: {};
        logout_event: {};
        customer_changed: {};
    }[Key_1]) => void) => {
        unregister: () => void;
    };
    getUserId: () => string;
    getParsedJwt: <R_1 = {
        user_id: string;
        exp: number;
    }>() => R_1 | undefined;
    getJwtToken: () => string;
    accessTokenHasExpired: () => boolean;
};
/**
 * @deprecated use generateSrvAuthBindings
 *
 */
export declare function generateSrvAuthBindingsMicroApp(logout?: () => void): {
    isJwtValid: () => boolean;
    getConnector: () => string | undefined;
    getCachedJwt: () => Promise<string | undefined>;
    srvAuthGet: <R>(url: string, headers?: Record<string, string> | undefined) => Promise<R>;
    setReqConfig: <T = unknown>(data?: T | undefined, responseType?: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream" | undefined) => Promise<{
        data: T | undefined;
        responseType: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream" | undefined;
        headers: Record<string, string>;
    }>;
    getSrvUrls: () => Record<"ao_wrapper" | "connector", string> | undefined;
};
export {};
//# sourceMappingURL=generateSrvAuthBindings.d.ts.map