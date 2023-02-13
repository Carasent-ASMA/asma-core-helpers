export function getGqlOperationName(query) {
    var _a, _b, _c, _d, _e;
    const is_query = query.includes('query') ? 'query' : undefined;
    const is_mutation = query.includes('mutation') ? 'mutation' : undefined;
    const is_subscription = query.includes('subscription') ? 'subscription' : undefined;
    const split_word = is_query || is_mutation || is_subscription;
    if (!split_word) {
        return undefined;
    }
    let operationName = (_e = (_d = (_c = (_b = (_a = query === null || query === void 0 ? void 0 : query.split(split_word, 2)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.split('{', 1)[0]) === null || _c === void 0 ? void 0 : _c.split(' ')) === null || _d === void 0 ? void 0 : _d[1]) === null || _e === void 0 ? void 0 : _e.trim();
    if (operationName === null || operationName === void 0 ? void 0 : operationName.includes('(')) {
        operationName = operationName.split('(', 1)[0];
    }
    return operationName;
}
//# sourceMappingURL=getGqlOperationName.js.map