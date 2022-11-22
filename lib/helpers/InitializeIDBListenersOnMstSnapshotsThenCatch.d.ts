/**
 * @description
 * On internal function applySnapshotOnResolvedIDBGetPromise :
 * When using await get( ) it at first load most of the times intrerupt code exectuion and does nothing
 * as a workaround is used get('some-key').then(...).catch(...) it might be a bit anoyng for user because
 * it shows empty application and after adds data.
 */
export declare function initiatieIDBListenersOnMstSnaphsotsThenCatch<T extends Object, K extends keyof T>(store: T, omit?: K[]): Promise<void>;
//# sourceMappingURL=InitializeIDBListenersOnMstSnapshotsThenCatch.d.ts.map