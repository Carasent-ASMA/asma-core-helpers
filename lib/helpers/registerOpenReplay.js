import { registerCallbackOnSrvAuthEvents } from 'asma-helpers/lib';
import { EnvConfigsFnInternal } from './generateEnvConfigsBindings';
import { getCachedJwtInternal } from './generateSrvAuthBindings';
import { parseJwt } from './parseJwt';
export let tracker;
const isStage = window.location.hostname.includes('stage');
export async function registerOpenReplay() {
    var _a;
    if (EnvConfigsFnInternal().DEVELOPMENT || isStage) {
        const Tracker = (await import('@openreplay/tracker')).default;
        tracker = new Tracker({
            projectKey: (_a = EnvConfigsFnInternal().OPENREPLAY_PROJECT_KEY) !== null && _a !== void 0 ? _a : 'kCn3WuRKfKLJHpcqKF58',
            onStart: (sessionId) => {
                console.log(`OpenReplay started with session id: ${JSON.stringify(sessionId, undefined, 4)}`);
            },
        });
        tracker.setMetadata('hostname', window.location.hostname);
        const { unregister } = registerCallbackOnSrvAuthEvents('jwt_changed', async () => {
            const jwt_string = await getCachedJwtInternal();
            const jwt = jwt_string && parseJwt(jwt_string);
            if (jwt) {
                tracker.setUserID(jwt.user_id);
                tracker.setMetadata('customer_id', jwt.customer_id || 'no-customer_id-were-provided');
                unregister();
            }
            else {
                tracker.setUserAnonymousID(`anonymous-timestamp-${Date.now().toString()}`);
            }
        });
        const res = await tracker.start();
        res.success ? console.info('OpenReplay started') : console.error('OpenReplay failed to start');
    }
}
//# sourceMappingURL=registerOpenReplay.js.map