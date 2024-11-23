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
        widget: string
        variation: string
        order: number
        settings: {
            amount_of_rows: number
            status: string
        }
        name: string | null
        description: string | null
    }[]
}[]

type IPrivacyPolicy = {
    content_en: string | null
    content_no: string | null
}

export type ICheckSigninTransformedOptions<IFeaturesArr extends string> = Omit<
    ICheckSigninOptions<IFeaturesArr>,
    'features'
> & {
    features: Set<IFeaturesArr>
}

export type ICheckSigninOptions<IFeaturesArr extends string> = Pick<
    ITherapistOrSuperUserJwtClaims<'admin' | 'super_user' | 'therapist' | 'recipient'>,
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
    features?: IFeaturesArr[]
    user_id?: string // Made optional
    brukerBrukerNavn?: string // Made optional
    user_role?: 'super_user' | 'therapist' | 'recipient'
    journal_role?: string
    /** @info when expires epoch in secs ex: 1725898034*/
    iat?: number
    /** @info when expires epoch in secs ex: 1725898034*/
    exp?: number
    /** @info validity in minute eg: 30 (valid 30 minutes)*/
    vt?: number
    region?: string
    identity?: string
    access_level?: 1 | 2 | 3 | 4
    advoca_info_link?: string
    /** @info only for anonymous */
    privacy_policy?: IPrivacyPolicy
}
