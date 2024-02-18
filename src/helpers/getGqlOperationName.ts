export function getGqlOperationName(query: string): string | undefined {
    const is_query = query.includes('query') ? 'query' : undefined

    const is_mutation = query.includes('mutation') ? 'mutation' : undefined

    const is_subscription = query.includes('subscription') ? 'subscription' : undefined

    const split_word = is_query || is_mutation || is_subscription

    if (!split_word) {
        return undefined
    }

    let operationName = query?.split(split_word, 2)?.[1]?.split('{', 1)[0]?.split(' ')?.[1]?.trim()

    if (operationName?.includes('(')) {
        operationName = operationName.split('(', 1)[0]
    }

    return operationName
}
