declare type ObjectType<T> = T extends string ? string : T extends boolean ? boolean : never;
export declare function config<T>(env_var: string, default_value: T): ObjectType<T>;
export declare function configWeb<T>(env_var: string, default_value: T): ObjectType<T>;
export declare function httpToWs(url: string): string;
export declare function httpToWs2(url: string): string;
export {};
//# sourceMappingURL=Config.d.ts.map