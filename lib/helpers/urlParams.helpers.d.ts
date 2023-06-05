import { type ISearchParams, type SearchParamWithValues } from 'asma-types';
type ISetParamByName<Key extends ISearchParams> = {
    name: Key;
    value: (typeof SearchParamWithValues)[Key];
};
export declare function setParamByName<Key extends ISearchParams>(data: ISetParamByName<Key> | ISetParamByName<Key>[], del?: ISearchParams | ISearchParams[]): void;
export declare function deleteParamByName(name: ISearchParams | ISearchParams[]): void;
export declare function getParamByName<Key extends ISearchParams>(name: Key): {
    readonly selected_patient_id: string;
    readonly selected_query_id: string;
    readonly user_context: import("asma-types").IUserContext;
}[Key] | null;
export {};
//# sourceMappingURL=urlParams.helpers.d.ts.map