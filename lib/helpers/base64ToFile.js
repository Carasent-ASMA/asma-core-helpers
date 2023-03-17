/* @__PURE__ */
export function base64toFile(b64Data, name, type = 'application/pdf') {
    const bytes = window.atob(b64Data);
    const writer = new Uint8Array(new ArrayBuffer(bytes.length));
    for (let i = 0; i < bytes.length; i++) {
        writer[i] = bytes.charCodeAt(i);
    }
    return new File([writer.buffer], name, { type });
}
//# sourceMappingURL=base64ToFile.js.map