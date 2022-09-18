import { del, get, set } from 'idb-keyval';
import { applySnapshot, onSnapshot, isStateTreeNode } from 'mobx-state-tree';
function setIDBListenersOnSnapshots(store, omit = []) {
    const keys = Object.keys(store).filter((k) => !omit.includes(k));
    keys.forEach((key) => {
        const mst_node = store[key];
        if (isStateTreeNode(mst_node)) {
            onSnapshot(mst_node, (snapshot) => {
                set(String(key), snapshot).catch((e) => console.error(e));
            });
        }
    });
}
async function checkForIDBData(main_store) {
    const keys = Object.keys(main_store);
    const stores_promises = [];
    const promises = keys.reduce((acc, key) => {
        if (typeof main_store[key] === 'object')
            acc.push(applySnapshotOnResolvedIDBGetPromise(key, main_store));
        return acc;
    }, stores_promises);
    await myPromiseAllSettled(promises);
}
export function initiatieIDBListenersOnMstSnaphsots(store, omit = []) {
    setIDBListenersOnSnapshots(store, omit);
    return checkForIDBData(store);
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
function* map(iterable, callback) {
    for (const value of iterable) {
        yield callback(value);
    }
}
const myPromiseAllSettled = (promises) => {
    const fulfilled = (value) => ({ status: 'fulfilled', value });
    const rejected = (reason) => ({ status: 'rejected', reason });
    return Promise.all(map(promises, (p) => Promise.resolve(p).then(fulfilled, rejected)));
};
//# sourceMappingURL=InitializeIDBListenersOnMstSnapshots.js.map