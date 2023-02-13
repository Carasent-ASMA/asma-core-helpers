import type { AxiosRequestConfig } from 'axios';
import type { ClientOptions } from '@genql/runtime';
interface CliOptions extends Omit<ClientOptions, 'url' | 'signal'> {
    anonymous?: boolean;
}
export declare function generateGenqlClient<T extends ReturnType<typeof createClient>>({ setReqConfig, createClient, serviceUrl, path, }: {
    setReqConfig: () => Promise<AxiosRequestConfig<any>>;
    createClient: (options?: ClientOptions | undefined) => T;
    serviceUrl: () => string;
    path?: string;
}): {
    getGenqlClient: () => Promise<T>;
    resetGenqlClient: () => void;
    genqlClient: (options?: CliOptions & {
        abortController?: AbortController;
    }) => Promise<T>;
    genqlClientWs: () => Promise<T>;
};
export {};
//# sourceMappingURL=generateGenqlClient.d.ts.map