const OpenReplayObject = {
    started: false,
    tracker: undefined,
    // eslint-disable-next-line @typescript-eslint/ban-types
    trackerProfiler: undefined,
    trackerGraphQL: undefined,
    mobxObserver: undefined,
};
export function getOpenReplayObject() {
    var _a;
    if ((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.openreplay_object) {
        return window.__ASMA__SHELL__.openreplay_object;
    }
    return OpenReplayObject;
}
export function getOpenReplayTrackerObject(name) {
    var _a;
    if ((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.openreplay_object) {
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