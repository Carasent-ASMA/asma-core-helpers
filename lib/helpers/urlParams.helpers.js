import {} from 'asma-types';
import { history } from '../global';
export function setParamByName(name, value) {
    const searchParams = new URLSearchParams(history.location.search);
    searchParams.set(name, value);
    history.push(`${window.location.pathname}?${searchParams.toString()}`);
}
export function getParamByName(name) {
    const urlParams = new URLSearchParams(history.location.search);
    const param = urlParams.get(name) || '';
    return param;
}
//# sourceMappingURL=urlParams.helpers.js.map