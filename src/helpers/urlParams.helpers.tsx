import type { ISearchParams } from 'asma-types'
import { history } from '../global'

export function setParamByName(name: ISearchParams, value: string) {
    const searchParams = new URLSearchParams(history.location.search)

    searchParams.set(name, value)

    history.push(`${window.location.pathname}?${searchParams.toString()}`)
}

export function getParamByName(name: string) {
    const urlParams = new URLSearchParams(history.location.search)

    const param = urlParams.get(name) || ''

    return param
}
