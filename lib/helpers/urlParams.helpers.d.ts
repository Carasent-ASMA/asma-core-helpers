import { type ISearchParams, type SearchParamWithValues } from 'asma-types';
export declare function setParamByName<Key extends ISearchParams>(name: Key, value: (typeof SearchParamWithValues)[Key]): void;
export declare function getParamByName(name: ISearchParams): string;
//# sourceMappingURL=urlParams.helpers.d.ts.map