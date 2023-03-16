declare global {
    interface Window {
        __ASMA_clearCacheDataCalled__: boolean;
    }
}
/**
 *
 * @imortant When using in micro-apps combination shell/child make sure this app is called only once and only in shell app! otherwise it will have unexpected behaviour with no errors or warnings
 */
export declare const clearCacheData: (CACHE_VERSION: string) => Promise<void>;
//# sourceMappingURL=clearCacheData.d.ts.map