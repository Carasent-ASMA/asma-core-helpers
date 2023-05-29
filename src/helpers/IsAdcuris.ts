import { getConnectorInternal } from './generateSrvAuthBindings'

export const is_adcuris = isAdcuris()
/* @__PURE__ */
export function isAdcuris() {
    return window.location.host.includes('adcuris') || getConnectorInternal() === 'ADCURIS'
}
