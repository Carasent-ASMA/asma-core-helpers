import { getConnectorInternal } from './generateSrvAuthBindings'

let includesAdcurisInHost: boolean | undefined

export function isAdcuris() {
    if (includesAdcurisInHost === undefined) {
        includesAdcurisInHost = window.location.host.includes('adcuris')
    }

    return includesAdcurisInHost || getConnectorInternal() === 'ADCURIS'
}
