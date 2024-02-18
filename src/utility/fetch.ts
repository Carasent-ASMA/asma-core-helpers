export async function http<R>(request: RequestInfo, init?: RequestInit): Promise<R> {
    const response = await fetch(request, init)

    const body = await response.json()

    return body
}
