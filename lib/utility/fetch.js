export async function http(request, init) {
    const response = await fetch(request, init);
    const body = await response.json();
    return body;
}
//# sourceMappingURL=fetch.js.map