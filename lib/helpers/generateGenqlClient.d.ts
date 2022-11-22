import type { AxiosRequestConfig } from 'axios';
import type { ClientOptions } from '@genql/runtime';
interface CliOptions extends Omit<ClientOptions, 'url'> {
    anonymous?: boolean;
}
export declare function generateGenqlClient<T>({ accessTokenHasExpired, setReqConfig, createClient, serviceUrl, path, }: {
    accessTokenHasExpired: () => boolean;
    setReqConfig: () => Promise<AxiosRequestConfig<any>>;
    createClient: (options?: ClientOptions | undefined) => T;
    serviceUrl: () => string;
    path?: string;
}): {
    getGenqlClient: () => Promise<T>;
    resetGenqlClient: () => void;
    genqlClient: (options?: CliOptions) => Promise<T>;
    genqlClientWs: () => Promise<T>;
};
export {};
//# sourceMappingURL=generateGenqlClient.d.ts.map