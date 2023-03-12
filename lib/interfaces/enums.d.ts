export declare enum InitiatorTypes {
    Customer = "customer",
    Patient = "patient",
    SelfCompletable = "self-completable"
}
export declare enum QnrContextTypes {
    Advoca = "advoca",
    Portal = "portal",
    Outlook = "outlook"
}
export declare enum DocSignicatSignStatusTypes {
    Complteted = "completed",
    Rejected = "rejected",
    Waiting = "waiting"
}
export declare enum DocProxyStatusTypes {
    Signed = "signed",
    WaitingForSigning = "waiting_for_signing",
    OnlyForView = "only_for_view"
}
export declare enum QuestionTypes {
    BooleanQuestion = "BooleanQuestion",
    CheckBoxes = "CheckBoxes",
    CompositeQuestion = "CompositeQuestion",
    DateField = "DateField",
    Dropdown = "Dropdown",
    FormatNumber = "FormatNumber",
    LinearScale = "LinearScale",
    Link = "Link",
    RadioButtons = "RadioButtons",
    TextLong = "TextLong",
    TextShort = "TextShort",
    Emoticons = "Emoticons",
    DocumentUpload = "DocumentUpload",
    Readonly = "Readonly",
    ExpressionQuestion = "ExpressionQuestion",
    Chart = "Chart"
}
export declare enum ActorTypes {
    Mappable = "mappable",
    Custom = "custom",
    Complex = "complex"
}
export declare const EnvironmentEnums: {
    local: string;
    dev: string;
    test: string;
    stage: string;
    prod: string;
};
export type IEnvironmentEnums = keyof typeof EnvironmentEnums;
//# sourceMappingURL=enums.d.ts.map