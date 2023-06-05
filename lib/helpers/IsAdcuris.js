import { getConnectorInternal } from './generateSrvAuthBindings';
let includesAdcurisInHost;
/* @__PURE__ */
export function isAdcuris() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = window.location.host.includes('adcuris');
    }
    return includesAdcurisInHost || getConnectorInternal() === 'ADCURIS';
}
//# sourceMappingURL=IsAdcuris.js.map