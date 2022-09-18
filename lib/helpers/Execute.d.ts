/**
 * Method return always resolved promise it handels cases when there is a gql error or a request/system error
 *
 *
 * @param service_url url where shall be perfomrmed request
 * @param operation qraphQl query
 * @param variables
 * @param admin_secret
 * @param headers
 * @returns T|undefined
 */
interface IExecuteFe {
    service_url: string;
    operation: string;
    variables?: Record<string, unknown>;
    headers?: Record<string, string>;
}
export declare function executeFE<R>({ headers, service_url, operation, variables, }: IExecuteFe): Promise<R | undefined>;
export {};
//# sourceMappingURL=Execute.d.ts.map