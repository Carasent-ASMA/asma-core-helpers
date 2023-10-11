export function _processServerError(error: string | Record<string, any>): string {
    console['error'](error)

    let errorMessage = _getServerErrorMessage(error)

    /* if (i18n[errorMessage]) {
        ;(errorMessage = (window as any).strings)[errorMessage]
    } */

    //showErrorMessage(operationName || 'Error', errorMessage)
    return errorMessage.slice(0, 250)
}
/* @__PURE__ */
export function _getServerErrorMessage(error: Record<string, any> | string): string {
    if (typeof error == 'string') {
        return error
    } else if (error['data'] && error['data']['Message']) {
        return error['data']['Message']
    }
    if (Array.isArray(error)) {
        return _getArrayErrorsMessage(error)
    }
    if (Array.isArray(error?.['errors'])) {
        return _getArrayErrorsMessage(error['errors'])
    }
    //graphql
    else if (error['bodyText']) {
        return error['bodyText']
    } else if (error['response'] && error['response'].data) {
        const data = error['response'].data?.['error'] ?? error['response'].data

        if (typeof data == 'string') {
            return data
        } else if (data?.constructor === Object) {
            const keys = Object.keys(data)

            if (keys[0]) {
                const objKey = keys[0]

                if (data[objKey]['message']) {
                    return data[objKey]['message']
                } else if (data[objKey][0] && data[objKey][0]['message']) {
                    return data[objKey][0]['message']
                } else if (typeof data[objKey] == 'string') {
                    return data[objKey]
                } else if (data[objKey].constructor === Object) {
                    const childKeys = Object.keys(data[objKey])

                    if (childKeys[0]) {
                        const objKey2 = childKeys[0]

                        return `${objKey2}: ${data[objKey][objKey2]}`
                    } else {
                        return 'Missing child field: empty keys'
                    }
                } else if (data[objKey].constructor === Array) {
                    if (data[objKey][0] === 'validation.required') {
                        return `window.strings.field_is_required ${objKey}`
                    } else {
                        return `${objKey}: ${data[objKey][0]}`
                    }
                } else {
                    return 'Missing field: Message not available'
                }
            } else {
                return 'Missing field: Response keys are empty'
            }
        } else {
            return 'Missing field: data type not processed'
        }
    } else if (error['message']) {
        return error['message']
    } else if (error['error']) {
        return error['error']
    } else if (error?.['request']?.['response']) {
        return error['request']['response']
    } else {
        return "Missing field: Couldn't process error"
    }
}

function _getArrayErrorsMessage(error: Record<string, unknown>[]): string {
    const processed_error = error
        .map((err) => {
            if ('message' in err) {
                return err['message'] as string
            } else return ''
        })
        .join()

    return processed_error ?? 'No message field found! please check logs'
}
