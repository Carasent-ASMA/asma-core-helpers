import {} from 'asma-types';
import { history } from '../global';
export function setParamByName(data, del) {
    const searchParams = new URLSearchParams(globalThis.location.search);
    if (del) {
        deleteParams(searchParams, del);
    }
    if (Array.isArray(data)) {
        data.forEach((item) => {
            searchParams.set(item.name, item.value);
        });
    }
    else {
        searchParams.set(data.name, data.value);
    }
    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`);
}
function deleteParams(search_params, name) {
    if (Array.isArray(name)) {
        name.forEach((item) => {
            search_params.delete(item);
        });
    }
    else {
        search_params.delete(name);
    }
}
export function deleteParamByName(name) {
    const searchParams = new URLSearchParams(globalThis.location.search);
    deleteParams(searchParams, name);
    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`);
}
export function getParamByName(name) {
    const urlParams = new URLSearchParams(history.location.search);
    const param = urlParams.get(name);
    return param;
}
//# sourceMappingURL=urlParams.helpers.js.map