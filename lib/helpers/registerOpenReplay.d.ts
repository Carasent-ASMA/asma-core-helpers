import type Tracker from '@openreplay/tracker';
declare const GlobalOpenReplay: {
    started: boolean;
    tracker: Tracker | undefined;
    trackerProfiler: ((name: string) => (fn: Function, thisArg?: any) => any) | undefined;
    trackerGraphQL: ((_1: string, _2: string, _3: any, result: any) => any) | undefined;
};
type IGlobalOpenReplay = Required<typeof GlobalOpenReplay>;
declare global {
    interface Window {
        __ASMA_OPENREPLAY__?: Partial<IGlobalOpenReplay>;
    }
}
export declare function getTrackerModule<Keys extends keyof IGlobalOpenReplay>(name: Keys): Partial<Required<{
    started: boolean;
    tracker: Tracker | undefined;
    trackerProfiler: ((name: string) => (fn: Function, thisArg?: any) => any) | undefined;
    trackerGraphQL: ((_1: string, _2: string, _3: any, result: any) => any) | undefined;
}>>[Keys] | undefined;
export declare function registerOpenReplay(startForSpecificCustomer?: boolean): Promise<void>;
export {};
//# sourceMappingURL=registerOpenReplay.d.ts.map