import type Tracker from '@openreplay/tracker'

const OpenReplayObject = {
    started: false,
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
    if (window.__ASMA__SHELL__?.openreplay_object) {
        return window.__ASMA__SHELL__.openreplay_object
    }
    return OpenReplayObject
}
export function getOpenReplayTrackerObject<Keys extends keyof IGlobalOpenReplay>(name: Keys) {
    if (window.__ASMA__SHELL__?.openreplay_object) {
        return window.__ASMA__SHELL__.openreplay_object[name]
    }
    return OpenReplayObject[name]
}

export function setOpenReplayTrackerObject<Key extends keyof IGlobalOpenReplay>(
    name: Key,
    module: IGlobalOpenReplay[Key],
) {
    OpenReplayObject[name] = module

    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {}

    window.__ASMA__SHELL__.openreplay_object = OpenReplayObject
}
