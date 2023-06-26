let openreplay = null;
export function getOpenReplayConfig() {
    var _a;
    if ((_a = window.__ASMA__SHELL__) === null || _a === void 0 ? void 0 : _a.openreplay_configs) {
        return window.__ASMA__SHELL__.openreplay_configs;
    }
    return openreplay;
}
export function _setOpenReplayConfig(config) {
    openreplay = config;
    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {};
    window.__ASMA__SHELL__.openreplay_configs = config;
}
//# sourceMappingURL=openReplayConfigs.js.map