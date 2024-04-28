import { realWindow } from '../g-definitions'
import { getConnectorInternal } from './generateSrvAuthBindings'

let includesAdcurisInHost: boolean | undefined

export function isAdcuris() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = realWindow.location.host.includes('adcuris')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADCURIS'
}
