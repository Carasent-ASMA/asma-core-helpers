export const clearCacheData = async (CACHE_VERSION) => {
    const version = localStorage.getItem('version');
    if ((!version || version !== CACHE_VERSION) && indexedDB && typeof indexedDB['databases'] === 'function') {
        const IndexedDBS = await indexedDB.databases();
        IndexedDBS.forEach((IndexedDB) => {
            IndexedDB.name && indexedDB.deleteDatabase(IndexedDB.name);
        });
        localStorage.setItem('version', CACHE_VERSION);
    }
};
//# sourceMappingURL=clearCacheData.js.map