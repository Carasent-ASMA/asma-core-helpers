/* @__PURE__ */
export function parseJwt(jwtToken) {
    const base64Url = jwtToken?.split('.')[1];
    if (!base64Url) {
        return;
    }
    return JSON.parse(decodeURIComponent(escape(window.atob(base64Url))));
}
//# sourceMappingURL=parseJwt.js.map