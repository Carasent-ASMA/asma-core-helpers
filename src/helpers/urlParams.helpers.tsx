import { type ISearchParams, type SearchParamWithValues } from 'asma-types'
import { history } from '../global'

export function setParamByName<Key extends ISearchParams>(name: Key, value: (typeof SearchParamWithValues)[Key]) {
    const searchParams = new URLSearchParams(history.location.search)

    searchParams.set(name, value)

    history.push(`${window.location.pathname}?${searchParams.toString()}`)
}

export function getParamByName(name: ISearchParams) {
    const urlParams = new URLSearchParams(history.location.search)

    const param = urlParams.get(name) || ''

    return param
}
