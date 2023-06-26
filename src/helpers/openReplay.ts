let openreplay: IOpenReplayConfig | null = null

export type IOpenReplayConfig = {
    enable: boolean
    graphql: boolean
    live_assist: boolean
    mobx: boolean
    profiler: boolean
}

export function getOpenReplayConfig() {
    if (window.__ASMA__SHELL__?.openreplay) {
        return window.__ASMA__SHELL__.openreplay
    }
    return openreplay
}

export function _setOpenReplayConfig(config: IOpenReplayConfig) {
    openreplay = config

    window.__ASMA__SHELL__ = window.__ASMA__SHELL__ || {}

    window.__ASMA__SHELL__.openreplay = config
}
