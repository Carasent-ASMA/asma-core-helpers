import type { AxiosRequestConfig } from 'axios';
import type { ClientOptions } from '@genql/runtime';
interface CliOptions extends Omit<ClientOptions, 'url'> {
    anonymous?: boolean;
}
export declare function generateGenqlClient<T extends ReturnType<typeof createClient>>({ setReqConfig, createClient, serviceUrl, path, }: {
    setReqConfig: () => Promise<AxiosRequestConfig<any>>;
    createClient: (options?: ClientOptions | undefined) => T | null;
    serviceUrl: () => string;
    path?: string;
}): {
    getGenqlClient: () => Promise<T | null>;
    genqlClient: (options?: CliOptions) => Promise<T | null>;
    genqlClientWs: () => Promise<T | null>;
};
export {};
//# sourceMappingURL=generateGenqlClient.d.ts.map