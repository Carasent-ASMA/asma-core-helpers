import type Tracker from '@openreplay/tracker';
declare const OpenReplayObject: {
    started: boolean;
    tracker: Tracker | undefined;
    trackerProfiler: ((name: string) => (fn: () => Function, thisArg?: unknown) => unknown) | undefined;
    trackerGraphQL: ((_1: string, _2: string, _3: unknown, result: unknown) => unknown) | undefined;
    mobxObserver: ((ev: {
        type: string;
        name: string;
        object: any;
        debugObjectName: string;
    }) => void) | undefined;
};
export type IGlobalOpenReplay = Required<typeof OpenReplayObject>;
export declare function getOpenReplayTrackerObject<Keys extends keyof IGlobalOpenReplay>(name: Keys): Required<{
    started: boolean;
    tracker: Tracker | undefined;
    trackerProfiler: ((name: string) => (fn: () => Function, thisArg?: unknown) => unknown) | undefined;
    trackerGraphQL: ((_1: string, _2: string, _3: unknown, result: unknown) => unknown) | undefined;
    mobxObserver: ((ev: {
        type: string;
        name: string;
        object: any;
        debugObjectName: string;
    }) => void) | undefined;
}>[Keys];
export declare function setOpenReplayTrackerObject<Key extends keyof IGlobalOpenReplay>(name: Key, module: IGlobalOpenReplay[Key]): void;
export {};
//# sourceMappingURL=openReplayObject.d.ts.map