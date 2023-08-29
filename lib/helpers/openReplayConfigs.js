let openreplay = null;
export function getOpenReplayConfig() {
    if (window.__ASMA__SHELL__?.openreplay_configs) {
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