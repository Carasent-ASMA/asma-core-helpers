import { del, get, set } from 'idb-keyval'
import {
    applySnapshot,
    onSnapshot,
    isStateTreeNode,
    type IStateTreeNode,
    type IType,
    type IDisposer,
} from 'mobx-state-tree'

function setIDBListenersOnSnapshots<T extends Object, K extends keyof T>(store: T, omit: K[] = []) {
    const keys = (Object.keys(store) as Array<keyof typeof store>).filter((k) => !omit.includes(k as K))

    const unregister_registry: IDisposer[] = []

    keys.forEach((key) => {
        const mst_node = store[key]

        if (isStateTreeNode(mst_node)) {
            const disposer = onSnapshot(mst_node, (snapshot) => {
                set(String(key), snapshot).catch((e) => console.error(e))
            })
            unregister_registry.push(disposer)
        }
    })
    return unregister_registry
}

async function checkForIDBData<T extends Object>(main_store: T) {
    const keys = Object.keys(main_store) as Array<keyof typeof main_store>

    const stores_promises: Promise<void>[] = []

    const promises: Promise<void>[] = keys.reduce((acc, key) => {
        if (typeof main_store[key] === 'object') acc.push(applySnapshotOnResolvedIDBGetPromise(key, main_store))

        return acc
    }, stores_promises)

    await Promise.allSettled(promises)
}
/* @__PURE__ */
export function initiateIDBListenersOnMstSnaphsots<T extends Object, K extends keyof T>(store: T, omit: K[] = []) {
    const unregister_registry = setIDBListenersOnSnapshots(store, omit)

    function unregisterAll() {
        unregister_registry.forEach((unregister) => unregister())
    }

    return { idb_check_promise: checkForIDBData(store), unregisterAll }
}

async function applySnapshotOnResolvedIDBGetPromise<T extends Object>(key: keyof T, main_store: T): Promise<void> {
    try {
        const res = await get(String(key))

        if (res) {
            applySnapshot(main_store[key] as IStateTreeNode<IType<any, any, any>>, res)
        }
    } catch (e) {
        del(String(key))

        console.error(`resolveIDBGetPromise, ${String(key)}:`, e)
    }
}
