import { getConnectorInternal } from './generateSrvAuthBindings'

let includesAdcurisInHost: boolean | undefined
/* @__PURE__ */
export function isAdcuris() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = window.location.host.includes('adcuris')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADCURIS'
}
