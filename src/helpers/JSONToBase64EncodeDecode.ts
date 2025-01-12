import { Buffer } from 'buffer'
export function fromBase64ToJSON<T>(base64: string): T {
    const json_str = Buffer.from(base64, 'base64').toString('utf-8')
    return JSON.parse(json_str)
}

export function fromJSONToBase64<T>(json: T): string {
    const json_str = JSON.stringify(json)
    return Buffer.from(json_str).toString('base64')
}
