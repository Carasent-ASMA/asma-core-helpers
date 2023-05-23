import { type ISearchParams, type SearchParamWithValues } from 'asma-types'
import { history } from '../global'

type ISetParamByName<Key extends ISearchParams> = {
    name: Key
    value: (typeof SearchParamWithValues)[Key]
}

export function setParamByName<Key extends ISearchParams>(data: ISetParamByName<Key> | ISetParamByName<Key>[]) {
    const searchParams = new URLSearchParams(globalThis.location.search)

    if (Array.isArray(data)) {
        data.forEach((item) => {
            searchParams.set(item.name, item.value)
        })
    } else {
        searchParams.set(data.name, data.value)
    }

    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`)
}

export function deleteParamByName(name: ISearchParams | ISearchParams[]) {
    const searchParams = new URLSearchParams(globalThis.location.search)

    if (Array.isArray(name)) {
        name.forEach((item) => {
            searchParams.delete(item)
        })
    } else {
        searchParams.delete(name)
    }

    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`)
}

export function getParamByName(name: ISearchParams) {
    const urlParams = new URLSearchParams(history.location.search)

    const param = urlParams.get(name) || ''

    return param
}
