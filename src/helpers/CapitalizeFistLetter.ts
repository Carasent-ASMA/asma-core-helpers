/* @__PURE__ */
export function capitalizeFirstLetter(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
/* @__PURE__ */
export function toLowercaseAndCapitalizeFirstLetter(str: string) {
    return str.toLowerCase().charAt(0).toUpperCase() + str.slice(1)
}
