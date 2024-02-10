/* @__PURE__ */
export function isNotEmpty<T>(value: T | null | undefined) {
    if (value instanceof Array) {
        return value.length > 0
    } else if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0
    } else {
        return value !== null && value !== undefined
    }
}
