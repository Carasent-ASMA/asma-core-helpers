const OpenReplayObject = {
    started: false,
    tracker: undefined,
    // eslint-disable-next-line @typescript-eslint/ban-types
    trackerProfiler: undefined,
    trackerGraphQL: undefined,
    mobxObserver: undefined,
};
export function getOpenReplayObject() {
    if (window.__ASMA__SHELL__?.openreplay_object) {
        return window.__ASMA__SHELL__.openreplay_object;
    }
    return OpenReplayObject;
}
export function getOpenReplayTrackerObject(name) {
    if (window.__ASMA__SHELL__?.openreplay_object) {
        return window.__ASMA__SHELL__.openreplay_object[name];
    }
    return OpenReplayObject[name];
}
export function setOpenReplayTrackerObject(name, module) {
    OpenReplayObject[name] = module;
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {};
    window.__ASMA__SHELL__.openreplay_object = OpenReplayObject;
}
//# sourceMappingURL=openReplayObject.js.map