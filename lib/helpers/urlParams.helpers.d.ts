import { type ISearchParams, type SearchParamWithValues } from 'asma-types';
type ISetParamByName<Key extends ISearchParams> = {
    name: Key;
    value: (typeof SearchParamWithValues)[Key];
};
export declare function setParamByName<Key extends ISearchParams>(data: ISetParamByName<Key> | ISetParamByName<Key>[]): void;
export declare function deleteParamByName(name: ISearchParams | ISearchParams[]): void;
export declare function getParamByName(name: ISearchParams): string;
export {};
//# sourceMappingURL=urlParams.helpers.d.ts.map