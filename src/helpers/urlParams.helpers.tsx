import { type ISearchParams, type SearchParamWithValues } from 'asma-types'
import { history } from '../global'

type ISetParamByName<Key extends ISearchParams> = {
    name: Key
    value: (typeof SearchParamWithValues)[Key]
}

export function setParamByName<Key extends ISearchParams>(
    data: ISetParamByName<Key> | ISetParamByName<Key>[],
    del?: ISearchParams | ISearchParams[],
    state?: any,
) {
    const searchParams = new URLSearchParams(globalThis.location.search)

    if (del) {
        deleteParams(searchParams, del)
    }
    if (Array.isArray(data)) {
        data.forEach((item) => {
            if (Array.isArray(item.value)) {
                searchParams.set(item.name, item.value.join(','))
            } else {
                searchParams.set(item.name, item.value as string)
            }
        })
    } else {
        if (Array.isArray(data.value)) {
            searchParams.set(data.name, data.value.join(','))
        } else {
            searchParams.set(data.name, data.value as string)
        }
    }

    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`, state)
}

function deleteParams(search_params: URLSearchParams, name: ISearchParams | ISearchParams[]) {
    if (Array.isArray(name)) {
        name.forEach((item) => {
            search_params.delete(item)
        })
    } else {
        search_params.delete(name)
    }
}

export function deleteParamByName(name: ISearchParams | ISearchParams[]) {
    const searchParams = new URLSearchParams(globalThis.location.search)

    deleteParams(searchParams, name)

    history.push(`${globalThis.location.pathname}?${searchParams.toString()}`)
}

export function getParamByName<Key extends ISearchParams>(name: Key) {
    const urlParams = new URLSearchParams(history.location.search)

    const param = urlParams.get(name) as (typeof SearchParamWithValues)[Key] | null

    if (typeof param === 'string' && param.includes(',')) {
        return param.split(',') as (typeof SearchParamWithValues)[Key]
    }

    return param
}
