import { EnvironmentEnums } from '../interfaces/enums';
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
export declare function generateSrvAuthBindings<FeatureEnums = never>(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, EnvironmentToOperateFn: () => string, logout?: () => void): {
    hasFeature: (featureName: FeatureEnums) => boolean;
    getConnector: () => string | undefined;
    getFeatures: () => Set<FeatureEnums> | undefined;
    isJwtValid: () => boolean;
    signin: (url: string, headers?: Record<string, string>) => Promise<{
        token: string;
        features: FeatureEnums[];
        connector?: string | undefined;
    }>;
    srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<R>;
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
export declare function generateSrvAuthBindingsMicroApp(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums, logout?: () => void): {};
export {};
//# sourceMappingURL=generateSrvAuthBindings.d.ts.map