import { realWindow } from '../g-definitions'
import { getConnectorInternal } from './generateSrvAuthBindings'

let includesAdcurisInHost: boolean | undefined

export function isAdopus() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = realWindow.location.host.includes('adopus')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADOPUS'
}
