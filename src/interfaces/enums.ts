export enum InitiatorTypes {
    Customer = 'customer',
    Patient = 'patient',
    SelfCompletable = 'self-completable',
}

export enum QnrContextTypes {
    Advoca = 'advoca',
    Portal = 'portal',
    Outlook = 'outlook',
}
export enum DocSignicatSignStatusTypes {
    Complteted = 'completed',
    Rejected = 'rejected',
    Waiting = 'waiting',
}

export enum DocProxyStatusTypes {
    Signed = 'signed',
    WaitingForSigning = 'waiting_for_signing',
    OnlyForView = 'only_for_view',
    /* download = 'download',
    uploaded = 'uploaded' */
}
export enum QuestionTypes {
    BooleanQuestion = 'BooleanQuestion',
    CheckBoxes = 'CheckBoxes',
    CompositeQuestion = 'CompositeQuestion',
    DateField = 'DateField',
    Dropdown = 'Dropdown',
    FormatNumber = 'FormatNumber',
    LinearScale = 'LinearScale',
    Link = 'Link',
    RadioButtons = 'RadioButtons',
    TextLong = 'TextLong',
    TextShort = 'TextShort',
    Emoticons = 'Emoticons',
    DocumentUpload = 'DocumentUpload',
    Readonly = 'Readonly',
    ExpressionQuestion = 'ExpressionQuestion',
    Chart = 'Chart',
}

export enum ActorTypes {
    Mappable = 'mappable',
    Custom = 'custom',
    Complex = 'complex',
}

export const EnvironmentEnums =  {
    local: 'local',
    dev: 'dev',
    test: 'test',
    stage: 'stage',
    prod: 'prod',
}
export type IEnvironmentEnums = keyof typeof EnvironmentEnums
