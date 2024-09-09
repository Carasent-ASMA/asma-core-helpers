import type { ITherapistOrSuperUserJwtClaims } from 'asma-types/lib'
type IOpenreplay = {
    enable: boolean
    block: boolean
    live_assist: boolean
    graphql: boolean
    mobx: boolean
    profiler: boolean
}

export type ISrvUrls = Record<'ao_wrapper' | 'connector', string>

type IOverviews = {
    name: string
    app_context: 'ADVOCA' | 'JOURNAL_ME' | 'JOURNAL_RECIPIENT'
    overview_widgets: {
        variation: string
        order: number
        settings: unknown
        name: string | null
        description: string | null
    }[]
}[]

export type ICheckSigninOptions<IFeaturesArr extends string> = Pick<
    ITherapistOrSuperUserJwtClaims<any>,
    //| 'user_id' // Made optional
    //| 'brukerBrukerNavn' // Made optional
    | 'journal_user_id'
    // | 'identity' // Made optional
    | 'customer_id' // old is id
    | 'journal' // old is connector
    | 'srv_urls'
    //| 'isTeamLeader' // do i need before first step?
    | 'exp'
> & {
    srv_urls: ISrvUrls
    customer_name?: string
    user_name?: string
    openreplay?: IOpenreplay
    default_app_versions?: Record<string, string>
    isTeamLeader?: boolean
    overviews?: IOverviews
    device_authorized?: boolean
    theme?: string
    features?: Set<IFeaturesArr>
    user_id?: string // Made optional
    brukerBrukerNavn?: string // Made optional
    user_role?: 'super_user' | 'therapist' | 'recipient'
    journal_role?: string
    iat?: number
    vt?: number
}
