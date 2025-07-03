import type Tracker from '@openreplay/tracker'
import { realWindow } from './getSubdomain.js'

const OpenReplayObject = {
    started: false,
    // userIdSet: false,
    //metadataSet: {} as { customer_id?: Boolean; user_name?: boolean; journal_user_id?: boolean },
    tracker: undefined as Tracker | undefined,

    // eslint-disable-next-line @typescript-eslint/ban-types
    trackerProfiler: undefined as ((name: string) => (fn: () => Function, thisArg?: unknown) => unknown) | undefined,
    trackerGraphQL: undefined as ((_1: string, _2: string, _3: unknown, result: unknown) => unknown) | undefined,
    mobxObserver: undefined as
        | ((ev: { type: string; name: string; object: any; debugObjectName: string }) => void)
        | undefined,
}

export type IGlobalOpenReplay = Required<typeof OpenReplayObject>

export function getOpenReplayObject() {
    if (realWindow.__ASMA__SHELL__?.openreplay_object) {
        return realWindow.__ASMA__SHELL__.openreplay_object
    }
    return OpenReplayObject
}
export function getOpenReplayTrackerObject<Keys extends keyof IGlobalOpenReplay>(name: Keys) {
    if (realWindow.__ASMA__SHELL__?.openreplay_object) {
        return realWindow.__ASMA__SHELL__.openreplay_object[name]
    }
    return OpenReplayObject[name]
}
/* export function getOpenReplayMetadataSet<Keys extends keyof IGlobalOpenReplay['metadataSet']>(key: Keys) {
    if (realWindow.__ASMA__SHELL__?.openreplay_object) {
        return realWindow.__ASMA__SHELL__.openreplay_object.metadataSet[key]
    }
    return OpenReplayObject.metadataSet[key]
} */

export function resetOpenReplayTrackerObject() {
    OpenReplayObject.started = false
    const res = OpenReplayObject.tracker?.stop()
    console.info('OpenReplay stop:', res)
    //OpenReplayObject.userIdSet = false
    //OpenReplayObject.metadataSet = {}
    OpenReplayObject.tracker = undefined
    OpenReplayObject.trackerProfiler = undefined
    OpenReplayObject.trackerGraphQL = undefined
    OpenReplayObject.mobxObserver = undefined

    realWindow.__ASMA__SHELL__ = realWindow.__ASMA__SHELL__ || {}

    realWindow.__ASMA__SHELL__.openreplay_object = OpenReplayObject
}

export function setOpenReplayTrackerObject<Key extends keyof IGlobalOpenReplay>(
    name: Key,
    module: IGlobalOpenReplay[Key],
) {
    OpenReplayObject[name] = module

    realWindow.__ASMA__SHELL__ = realWindow.__ASMA__SHELL__ || {}

    realWindow.__ASMA__SHELL__.openreplay_object = OpenReplayObject
}
/* export function setOpenReplayTrackerObjectMetadataSet<Key extends keyof IGlobalOpenReplay['metadataSet']>(
    name: Key,
    module: IGlobalOpenReplay['metadataSet'][Key],
) {
    OpenReplayObject.metadataSet[name] = module

    realWindow.__ASMA__SHELL__ = realWindow.__ASMA__SHELL__ || {}

    realWindow.__ASMA__SHELL__.openreplay_object = OpenReplayObject
} */
