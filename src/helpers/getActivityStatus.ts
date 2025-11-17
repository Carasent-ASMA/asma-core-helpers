export const ActivityStatuses = {
    NO_ACCESS: 'NO_ACCESS',
    READ: 'READ',
    WRITE: 'WRITE',
} as const

export type ActivityStatus = (typeof ActivityStatuses)[keyof typeof ActivityStatuses]

export const getActivityStatus = (adgangkode: number): ActivityStatus => {
    switch (adgangkode) {
        case 0:
            return ActivityStatuses.NO_ACCESS
        case 1:
            return ActivityStatuses.READ
        case 2:
            return ActivityStatuses.WRITE
        default:
            return ActivityStatuses.NO_ACCESS
    }
}
