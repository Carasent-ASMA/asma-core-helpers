import { http } from "../utility/fetch";
export async function srvAuthGet(url, headers) {
    return http(url, {
        headers
    });
}
//# sourceMappingURL=srvAuth.js.map