import { AxiosRequestConfig, AxiosResponse, ResponseType } from 'axios';
import { EnvironmentEnums } from '..';
export interface IGenerateSRVAuthBindings {
    isJwtValid: () => boolean;
    signin(url: string, headers?: Record<string, string>): Promise<{
        token: string;
    }>;
    srvAuthGet<R>(url: string, headers?: Record<string, string>): Promise<AxiosResponse<R, any>>;
    signoutAuth(): Promise<void>;
    setReqConfig<T = unknown>(data?: T, responseType?: ResponseType): Promise<AxiosRequestConfig>;
    getJwtTokenAsync(): Promise<string>;
    getNewJwtToken(): Promise<string>;
    getUserId(): string;
    getParsedJwt<R = {
        user_id: string;
        exp: number;
    }>(): R | undefined;
    getJwtToken(): string;
    accessTokenHasExpired(): boolean;
}
export declare function generateSrvAuthBindings(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums, logout?: () => void): IGenerateSRVAuthBindings;
export declare function generateSrvAuthBindingsMicroApp(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums, logout?: () => void): IGenerateSRVAuthBindings;
//# sourceMappingURL=generateSrvAuthBindings.d.ts.map