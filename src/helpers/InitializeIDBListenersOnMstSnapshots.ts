import { del, get, set } from 'idb-keyval'
import { applySnapshot, onSnapshot, isStateTreeNode, type IStateTreeNode, type IType } from 'mobx-state-tree'
function setIDBListenersOnSnapshots<T extends Object, K extends keyof T>(store: T, omit: K[] = []) {
    const keys = (Object.keys(store) as Array<keyof typeof store>).filter((k) => !omit.includes(k as K))

    keys.forEach((key) => {
        const mst_node = store[key]

        if (isStateTreeNode(mst_node)) {
            onSnapshot(mst_node, (snapshot) => {
                set(String(key), snapshot).catch((e) => console.error(e))
            })
        }
    })
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

export function initiatieIDBListenersOnMstSnaphsots<T extends Object, K extends keyof T>(store: T, omit: K[] = []) {
    setIDBListenersOnSnapshots(store, omit)

    return checkForIDBData(store)
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
