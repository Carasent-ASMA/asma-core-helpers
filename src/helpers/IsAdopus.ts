import { getConnectorInternal } from './generateSrvAuthBindings'

let includesAdcurisInHost: boolean | undefined

export function isAdopus() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = window.location.host.includes('adopus')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADOPUS'
}
