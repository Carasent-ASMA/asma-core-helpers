import { realWindow } from './getSubdomain.js'
import { getConnectorInternal } from './generateSrvAuthBindings.js'

let includesAdcurisInHost: boolean | undefined

export function isAdcuris() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = realWindow.location.host.includes('adcuris')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADCURIS'
}
