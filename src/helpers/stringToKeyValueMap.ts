/**
 * Parses a semicolon-delimited key/value string into a flat string→string object.
 *
 * Expected format: `"key:value;key2:value2;..."`.
 *
 * - Only string keys and string values are supported.
 * - No nested objects, arrays, numbers, or booleans are parsed — all values are returned as strings.
 * - Whitespace around keys and values is trimmed.
 * - Empty segments are ignored.
 * - Segments without a colon (":") are skipped.
 * - Values may contain additional colons (only the first colon splits key/value).
 *
 * @param {string} str - The semicolon-separated string to parse.
 * @returns {Record<string, string>} A flat object containing key→string-value pairs.
 *
 * @example
 * parseToJson("a:1; b:hello; c:value:with:colons");
 * // => { a: "1", b: "hello", c: "value:with:colons" }
 *
 * @example
 * parseToJson("invalid; key:value");
 * // => { key: "value" }   // "invalid" is skipped
 */

export function stringToKeyValueMap<R extends Record<string, string>>(str: string): R {
    const result: Record<string, string> = {}

    str.split(';').forEach((part) => {
        const item = part.trim()

        if (!item || !item.includes(':')) {
            console.warn(`Skipping invalid segment: "${part || 'is empty'}"`)
            return
        } // skip invalid segments

        const [key, ...rest] = item.split(':')

        if (!key) return // skip if key is empty

        result[key] = rest.join(':')
    })

    return result as R
}
