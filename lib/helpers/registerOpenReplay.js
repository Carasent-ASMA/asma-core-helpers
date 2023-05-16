import { registerCallbackOnSrvAuthEvents } from 'asma-helpers/lib';
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings';
import { getCachedJwtInternal } from './generateSrvAuthBindings';
import { parseJwt } from './parseJwt';
let tracker;
const GlobalOpenReplay = {
    started: false,
    tracker: undefined,
    trackerProfiler: undefined,
    trackerGraphQL: undefined,
};
export function getOpenReplayTrackerModule(name) {
    var _a;
    return (_a = window.__ASMA_OPENREPLAY__) === null || _a === void 0 ? void 0 : _a[name];
}
const { unregister } = registerCallbackOnSrvAuthEvents('jwt_changed', async () => {
    var _a;
    if (!EnvConfigsFnInternal().OPENREPLAY_ENABLE) {
        return;
    }
    const jwt_string = await getCachedJwtInternal();
    const jwt = jwt_string &&
        parseJwt(jwt_string);
    if (!getOpenReplayTrackerModule('started') &&
        (jwt ? (_a = EnvConfigsFnInternal().OPENREPLAY_ENABLED_CUSTOMERS) === null || _a === void 0 ? void 0 : _a.includes(jwt.customer_id) : false)) {
        await registerOpenReplay(true);
    }
    if (jwt) {
        tracker === null || tracker === void 0 ? void 0 : tracker.setUserID(jwt.user_id);
        tracker === null || tracker === void 0 ? void 0 : tracker.setMetadata('customer_id', jwt.customer_id || 'no-customer_id-were-provided');
        tracker === null || tracker === void 0 ? void 0 : tracker.setMetadata('journal_user_id', jwt.journal_user_id || 'no-journal-were-present-were-provided');
        unregister();
    }
    else {
        tracker === null || tracker === void 0 ? void 0 : tracker.setUserAnonymousID(`anonymous-timestamp-${Date.now().toString()}`);
    }
});
export async function registerOpenReplay(startForSpecificCustomer = false) {
    if (getOpenReplayTrackerModule('started') ||
        !(EnvConfigsFnInternal().OPENREPLAY_ENABLE || startForSpecificCustomer)) {
        return;
    }
    const Tracker = (await import('@openreplay/tracker')).default;
    tracker = new Tracker({
        projectKey: EnvConfigsFnInternal().OPENREPLAY_PROJECT_KEY || '',
        sessionToken: localStorage.getItem('openreplay_session_token') || undefined,
        network: {
            capturePayload: true,
            failuresOnly: false,
            ignoreHeaders: false,
            sessionTokenHeader: 'X-OpenReplay-Session',
        },
        onStart: (sessionId) => {
            //localStorage.setItem('openreplay_session_id', sessionId.sessionID)
            localStorage.setItem('openreplay_session_token', sessionId.sessionToken);
            //localStorage.setItem('openreplay_session_token', sessionId.userUUID)
            console.log(`OpenReplay started with session id: ${JSON.stringify(sessionId, undefined, 4)}`);
        },
    });
    setTrackerModuleOnWindow('tracker', tracker);
    useTrackerMobxModule(tracker);
    useTrackerProfilerModule(tracker);
    useTrackerGraphQlModule(tracker);
    useTrackerLiveAssistModule(tracker);
    /*  const trackerMobxModule = (await import('@openreplay/tracker-mobx')).default

        tracker.use(trackerMobxModule()) */
    tracker.setMetadata('hostname', window.location.hostname);
    tracker.setUserAnonymousID(`user-friendly-id-visible-for-user}`);
    const res = await tracker.start();
    setTrackerModuleOnWindow('started', true);
    if (res.success) {
        console.info('OpenReplay started');
    }
    else {
        console.error('OpenReplay failed to start');
    }
}
async function useTrackerMobxModule(tracker) {
    if (!EnvConfigsFnInternal().OPENREPLAY_TRACKER_MOBX)
        return;
    const trackerMobxModule = (await import('@openreplay/tracker-mobx')).default;
    tracker.use(trackerMobxModule());
}
async function useTrackerProfilerModule(tracker) {
    if (EnvConfigsFnInternal().OPENREPLAY_TRACKER_PROFILER) {
        const trackerProfilerModule = (await import('@openreplay/tracker-profiler')).default;
        setTrackerModuleOnWindow('trackerProfiler', tracker.use(trackerProfilerModule()));
    }
}
async function useTrackerLiveAssistModule(tracker) {
    if (EnvConfigsFnInternal().OPENREPLAY_LIVE_ASSIST) {
        const trackerProfilerModule = (await import('@openreplay/tracker-assist')).default;
        tracker.use(trackerProfilerModule());
    }
}
async function useTrackerGraphQlModule(tracker) {
    if (EnvConfigsFnInternal().OPENREPLAY_TRACKER_GRAPHQL) {
        const trackerGraphQlModule = (await import('@openreplay/tracker-graphql')).default;
        setTrackerModuleOnWindow('trackerGraphQL', tracker.use(trackerGraphQlModule()));
    }
}
function setTrackerModuleOnWindow(name, //:
module) {
    window.__ASMA_OPENREPLAY__ = window.__ASMA_OPENREPLAY__ || {};
    window.__ASMA_OPENREPLAY__[name] = module;
}
//# sourceMappingURL=registerOpenReplay.js.map