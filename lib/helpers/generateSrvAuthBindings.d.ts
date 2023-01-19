import { type AxiosResponse, type ResponseType } from 'axios';
import { EnvironmentEnums } from '..';
export declare function getAbortController(): AbortController | undefined;
export declare function generateSrvAuthBindings<FeatureEnums = never>(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, EnvironmentToOperateFn: () => string, logout?: () => void): {
    hasFeature: (featureName: FeatureEnums) => boolean;
    getFeatures: () => Set<FeatureEnums> | undefined;
    isJwtValid: () => boolean;
    signin: (url: string, headers?: Record<string, string>) => Promise<{
        token: string;
        features: FeatureEnums[];
    }>;
    srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<AxiosResponse<R, any>>;
    signoutAuth: () => Promise<void>;
    setReqConfig: <T = unknown>(data?: T | undefined, responseType?: ResponseType) => Promise<{
        data: T | undefined;
        responseType: ResponseType | undefined;
        headers: Record<string, string>;
    }>;
    getJwtTokenAsync: () => Promise<string | undefined>;
    getNewJwtToken: () => Promise<string | undefined>;
    getUserId: () => string;
    getParsedJwt: <R_1 = {
        user_id: string;
        exp: number;
    }>() => R_1 | undefined;
    abortController: AbortController;
    getJwtToken: () => string;
    cancelRequest: () => boolean;
    accessTokenHasExpired: () => boolean;
};
/**
 * @deprecated use generateSrvAuthBindings
 *
 */
export declare function generateSrvAuthBindingsMicroApp(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums, logout?: () => void): {};
//# sourceMappingURL=generateSrvAuthBindings.d.ts.map