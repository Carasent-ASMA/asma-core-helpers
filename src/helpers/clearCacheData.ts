declare global {
    interface Window {
        __ASMA_clearCacheDataCalled__: boolean
    }
}
/**
 *
 * @imortant When using in micro-apps combination shell/child make sure this app is called only once and only in shell app! otherwise it will have unexpected behaviour with no errors or warnings
 */
export const clearCacheData = async (CACHE_VERSION: string) => {
    if (window.__ASMA_clearCacheDataCalled__) {
        return
    }
    window.__ASMA_clearCacheDataCalled__ = true

    const version = localStorage.getItem('version')
    if ((!version || version !== CACHE_VERSION) && indexedDB && typeof indexedDB['databases'] === 'function') {
        const IndexedDBS = await indexedDB.databases()

        IndexedDBS.forEach((IndexedDB) => {
            IndexedDB.name && indexedDB.deleteDatabase(IndexedDB.name)
        })

        localStorage.setItem('version', CACHE_VERSION)
    }
}
