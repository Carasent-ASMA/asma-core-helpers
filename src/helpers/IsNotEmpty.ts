/* @__PURE__ */
export function isNotEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined
}
