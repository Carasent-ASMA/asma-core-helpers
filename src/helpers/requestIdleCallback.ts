export function requestIdleCallbackPolyfill(callback: IdleRequestCallback, options?: IdleRequestOptions) {
    if (window.requestIdleCallback) {
        window.requestIdleCallback(callback, options)
    } else {
        window.setTimeout(callback, 1)
    }
}
