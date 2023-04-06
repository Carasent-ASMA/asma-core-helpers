import { del, get, set } from 'idb-keyval';
import { applySnapshot, onSnapshot, isStateTreeNode, } from 'mobx-state-tree';
function setIDBListenersOnSnapshots(store, omit = []) {
    const keys = Object.keys(store).filter((k) => !omit.includes(k));
    const unregister_registry = [];
    keys.forEach((key) => {
        const mst_node = store[key];
        if (isStateTreeNode(mst_node)) {
            const disposer = onSnapshot(mst_node, (snapshot) => {
                set(String(key), snapshot).catch((e) => console.error(e));
            });
            unregister_registry.push(disposer);
        }
    });
    return unregister_registry;
}
async function checkForIDBData(main_store) {
    const keys = Object.keys(main_store);
    const stores_promises = [];
    const promises = keys.reduce((acc, key) => {
        if (typeof main_store[key] === 'object')
            acc.push(applySnapshotOnResolvedIDBGetPromise(key, main_store));
        return acc;
    }, stores_promises);
    await Promise.allSettled(promises);
}
/* @__PURE__ */
export function initiateIDBListenersOnMstSnapshots(store, omit = []) {
    const unregister_registry = setIDBListenersOnSnapshots(store, omit);
    function unregisterAll() {
        unregister_registry.forEach((unregister) => unregister());
    }
    return { idb_check_promise: checkForIDBData(store), unregisterAll };
}
async function applySnapshotOnResolvedIDBGetPromise(key, main_store) {
    try {
        const res = await get(String(key));
        if (res) {
            applySnapshot(main_store[key], res);
        }
    }
    catch (e) {
        del(String(key));
        console.error(`resolveIDBGetPromise, ${String(key)}:`, e);
    }
}
//# sourceMappingURL=InitializeIDBListenersOnMstSnapshots.js.map