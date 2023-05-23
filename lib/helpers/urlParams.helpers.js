import {} from 'asma-types';
import { history } from '../global';
export function setParamByName(data) {
    const searchParams = new URLSearchParams(globalThis.location.search);
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
export function deleteParamByName(name) {
    const searchParams = new URLSearchParams(globalThis.location.search);
    if (Array.isArray(name)) {
        name.forEach((item) => {
            searchParams.delete(item);
        });
    }
    else {
        searchParams.delete(name);
    }
    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`);
}
export function getParamByName(name) {
    const urlParams = new URLSearchParams(history.location.search);
    const param = urlParams.get(name) || '';
    return param;
}
//# sourceMappingURL=urlParams.helpers.js.map