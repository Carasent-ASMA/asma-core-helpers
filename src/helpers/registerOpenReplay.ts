/* import type Tracker from '@openreplay/tracker'
import { registerCallbackOnSrvAuthEvents } from 'asma-helpers/lib'

import { EnvConfigsFnInternal } from './generateEnvConfigsBindings'
import { getCachedJwtInternal } from './generateSrvAuthBindings'
import { parseJwt } from './parseJwt'

let tracker: Tracker | undefined

const GlobalOpenReplay = {
    started: false,
    tracker: undefined as Tracker | undefined,
    trackerProfiler: undefined as ((name: string) => (fn: Function, thisArg?: any) => any) | undefined,
    trackerGraphQL: undefined as ((_1: string, _2: string, _3: any, result: any) => any) | undefined,
}

type IGlobalOpenReplay = Required<typeof GlobalOpenReplay>

declare global {
    interface Window {
        __ASMA_OPENREPLAY__?: Partial<IGlobalOpenReplay>
    }
}

export function getOpenReplayTrackerModule<Keys extends keyof IGlobalOpenReplay>(name: Keys) {
    return window.__ASMA_OPENREPLAY__?.[name]
}

const { unregister } = registerCallbackOnSrvAuthEvents('jwt_changed', async () => {
    if (!EnvConfigsFnInternal().OPENREPLAY_ENABLE) {
        return
    }

    const jwt_string = await getCachedJwtInternal()

    const jwt =
        jwt_string &&
        (parseJwt(jwt_string) as { customer_id: string; user_id: string; journal_user_id: string } | undefined)

    if (
        !getOpenReplayTrackerModule('started') &&
        (jwt ? EnvConfigsFnInternal().OPENREPLAY_ENABLED_CUSTOMERS?.includes(jwt.customer_id) : false)
    ) {
        await registerOpenReplay(true)
    }

    if (jwt) {
        tracker?.setUserID(jwt.user_id)

        tracker?.setMetadata('customer_id', jwt.customer_id || 'no-customer_id-were-provided')
        tracker?.setMetadata('journal_user_id', jwt.journal_user_id || 'no-journal-were-present-were-provided')

        unregister()
    } else {
        tracker?.setUserAnonymousID(`anonymous-timestamp-${Date.now().toString()}`)
    }
})

export async function registerOpenReplay(startForSpecificCustomer = false) {
    if (
        !getOpenReplayTrackerModule('started') &&
        (EnvConfigsFnInternal().OPENREPLAY_ENABLE || startForSpecificCustomer)
    ) {
        const Tracker = (await import('@openreplay/tracker')).default
        if (!EnvConfigsFnInternal().OPENREPLAY_PROJECT_KEY) {
            console.error('OPENREPLAY_PROJECT_KEY is not defined')
            return
        }
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

                localStorage.setItem('openreplay_session_token', sessionId.sessionToken)

                //localStorage.setItem('openreplay_session_token', sessionId.userUUID)

                console.log(`OpenReplay started with session id: ${JSON.stringify(sessionId, undefined, 4)}`)
            },
        })

        setTrackerModuleOnWindow('tracker', tracker)

        useTrackerMobxModule(tracker)

        useTrackerProfilerModule(tracker)

        useTrackerGraphQlModule(tracker)

        useTrackerLiveAssistModule(tracker)

        /*  const trackerMobxModule = (await import('@openreplay/tracker-mobx')).default

        tracker.use(trackerMobxModule()) *\/

        tracker.setMetadata('hostname', window.location.hostname)

        tracker.setUserAnonymousID(`user-friendly-id-visible-for-user}`)

        const res = await tracker.start()

        setTrackerModuleOnWindow('started', true)

        if (res.success) {
            console.info('OpenReplay started')
        } else {
            console.error('OpenReplay failed to start')
        }
    }
}

async function useTrackerMobxModule(tracker: Tracker) {
    if (!EnvConfigsFnInternal().OPENREPLAY_TRACKER_MOBX) return

    const trackerMobxModule = (await import('@openreplay/tracker-mobx')).default

    tracker.use(trackerMobxModule())
}

async function useTrackerProfilerModule(tracker: Tracker) {
    if (!EnvConfigsFnInternal().OPENREPLAY_TRACKER_PROFILER) return

    const trackerProfilerModule = (await import('@openreplay/tracker-profiler')).default

    setTrackerModuleOnWindow('trackerProfiler', tracker.use(trackerProfilerModule()))
}

async function useTrackerLiveAssistModule(tracker: Tracker) {
    if (EnvConfigsFnInternal().OPENREPLAY_LIVE_ASSIST) return

    const trackerProfilerModule = (await import('@openreplay/tracker-assist')).default

    tracker.use(trackerProfilerModule())
}

async function useTrackerGraphQlModule(tracker: Tracker) {
    if (EnvConfigsFnInternal().OPENREPLAY_TRACKER_GRAPHQL) return
    const trackerGraphQlModule = (await import('@openreplay/tracker-graphql')).default

    setTrackerModuleOnWindow('trackerGraphQL', tracker.use(trackerGraphQlModule()))
}

function setTrackerModuleOnWindow<keys extends keyof IGlobalOpenReplay>(
    name: keys, //:
    module: IGlobalOpenReplay[keys],
) {
    window.__ASMA_OPENREPLAY__ = window.__ASMA_OPENREPLAY__ || {}
    window.__ASMA_OPENREPLAY__[name] = module
}
 */
export {}
