import type { AxiosRequestConfig } from 'axios';
import type { ClientOptions } from '@genql/runtime';
interface CliOptions extends Omit<ClientOptions, 'url'> {
    anonymous?: boolean;
}
export declare function generateGenqlClient<T extends ReturnType<typeof createClient>>({ setReqConfig, createClient, serviceUrl, path, }: {
    setReqConfig: () => Promise<AxiosRequestConfig<any>>;
    createClient: (options?: ClientOptions | undefined) => T;
    serviceUrl: () => string;
    /**
     * Returns true whenether token and refresh token is epired! this helps to cancel all concurent requests after first request is invalidated.
     * @returns true if request should be cancelled
     */
    path?: string;
}): {
    getGenqlClient: () => Promise<T>;
    genqlClient: (options?: CliOptions) => Promise<T>;
    genqlClientWs: () => Promise<T>;
};
export {};
//# sourceMappingURL=generateGenqlClient.d.ts.map