import type { ClientOptions } from '@genql/runtime';
import { IEnvironmentUrlsGenQLOnly } from './generateEnvConfigsBindings';
interface CliOptions extends Omit<ClientOptions, 'url' | 'signal'> {
    anonymous?: boolean;
}
export declare function generateGenqlClient<T extends ReturnType<typeof createClient>>({ setReqConfig, createClient, service, path, }: {
    setReqConfig?: () => Promise<{
        headers: Record<string, string>;
    }>;
    createClient: (options?: ClientOptions | undefined) => T;
    service: keyof IEnvironmentUrlsGenQLOnly;
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