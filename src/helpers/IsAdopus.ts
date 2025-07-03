import { realWindow } from './getSubdomain.js'
import { getConnectorInternal } from './generateSrvAuthBindings.js'

let includesAdcurisInHost: boolean | undefined

export function isAdopus() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = realWindow.location.host.includes('adopus')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADOPUS'
}
