export function parseJwt(jwtToken) {
    const base64Url = jwtToken === null || jwtToken === void 0 ? void 0 : jwtToken.split('.')[1];
    if (base64Url === undefined) {
        return {};
    }
    return JSON.parse(decodeURIComponent(escape(window.atob(base64Url))));
}
//# sourceMappingURL=parseJwt.js.map