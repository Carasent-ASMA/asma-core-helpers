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
    try {
        await myPromiseAllSettled(promises);
    }
    catch (e) {
        console.error(e);
    }
}
/**
 * @description
 * On internal function applySnapshotOnResolvedIDBGetPromise :
 * When using await get( ) it at first load most of the times intrerupt code exectuion and does nothing
 * as a workaround is used get('some-key').then(...).catch(...) it might be a bit anoyng for user because
 * it shows empty application and after adds data.
 */
export function initiatieIDBListenersOnMstSnaphsotsThenCatch(store, omit = []) {
    setIDBListenersOnSnapshots(store, omit);
    return checkForIDBData(store);
}
async function applySnapshotOnResolvedIDBGetPromise(key, main_store) {
    const pkey = String(key);
    get(pkey)
        .then((res) => {
        if (res) {
            applySnapshot(main_store[key], res);
        }
    })
        .catch((e) => {
        del(String(key));
        console.error(`resolveIDBGetPromise, ${String(key)}:`, e);
    });
    /* try {
    
        const res = await get(pkey)

    } catch (e) {
    } */
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
//# sourceMappingURL=InitializeIDBListenersOnMstSnapshotsThenCatch.js.map