import type { AxiosRequestConfig } from 'axios';
import type { ClientOptions } from '@genql/runtime';
export declare function generateGenqlClient<T>({ accessTokenHasExpired, setReqConfig, createClient, serviceUrl, serviceUrlWs, path, }: {
    accessTokenHasExpired: () => boolean;
    setReqConfig: () => Promise<AxiosRequestConfig<any>>;
    createClient: (options?: ClientOptions | undefined) => T;
    serviceUrl: () => string | undefined;
    serviceUrlWs: () => string | undefined;
    path?: string;
}): {
    getGenGqlClient: () => Promise<T>;
    resetGenqlClient: () => void;
    genqlClient: (anonymous?: boolean | undefined, headers?: Record<string, string>) => Promise<T>;
    genqlClientWs: () => Promise<T>;
};
//# sourceMappingURL=generateGenqlClient.d.ts.map