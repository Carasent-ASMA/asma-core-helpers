export var InitiatorTypes;
(function (InitiatorTypes) {
    InitiatorTypes["Customer"] = "customer";
    InitiatorTypes["Patient"] = "patient";
    InitiatorTypes["SelfCompletable"] = "self-completable";
})(InitiatorTypes || (InitiatorTypes = {}));
export var QnrContextTypes;
(function (QnrContextTypes) {
    QnrContextTypes["Advoca"] = "advoca";
    QnrContextTypes["Portal"] = "portal";
    QnrContextTypes["Outlook"] = "outlook";
})(QnrContextTypes || (QnrContextTypes = {}));
export var DocSignicatSignStatusTypes;
(function (DocSignicatSignStatusTypes) {
    DocSignicatSignStatusTypes["Complteted"] = "completed";
    DocSignicatSignStatusTypes["Rejected"] = "rejected";
    DocSignicatSignStatusTypes["Waiting"] = "waiting";
})(DocSignicatSignStatusTypes || (DocSignicatSignStatusTypes = {}));
export var DocProxyStatusTypes;
(function (DocProxyStatusTypes) {
    DocProxyStatusTypes["Signed"] = "signed";
    DocProxyStatusTypes["WaitingForSigning"] = "waiting_for_signing";
    DocProxyStatusTypes["OnlyForView"] = "only_for_view";
    /* download = 'download',
    uploaded = 'uploaded' */
})(DocProxyStatusTypes || (DocProxyStatusTypes = {}));
export var QuestionTypes;
(function (QuestionTypes) {
    QuestionTypes["BooleanQuestion"] = "BooleanQuestion";
    QuestionTypes["CheckBoxes"] = "CheckBoxes";
    QuestionTypes["CompositeQuestion"] = "CompositeQuestion";
    QuestionTypes["DateField"] = "DateField";
    QuestionTypes["Dropdown"] = "Dropdown";
    QuestionTypes["FormatNumber"] = "FormatNumber";
    QuestionTypes["LinearScale"] = "LinearScale";
    QuestionTypes["Link"] = "Link";
    QuestionTypes["RadioButtons"] = "RadioButtons";
    QuestionTypes["TextLong"] = "TextLong";
    QuestionTypes["TextShort"] = "TextShort";
    QuestionTypes["Emoticons"] = "Emoticons";
    QuestionTypes["DocumentUpload"] = "DocumentUpload";
    QuestionTypes["Readonly"] = "Readonly";
    QuestionTypes["ExpressionQuestion"] = "ExpressionQuestion";
    QuestionTypes["Chart"] = "Chart";
})(QuestionTypes || (QuestionTypes = {}));
export var ActorTypes;
(function (ActorTypes) {
    ActorTypes["Mappable"] = "mappable";
    ActorTypes["Custom"] = "custom";
    ActorTypes["Complex"] = "complex";
})(ActorTypes || (ActorTypes = {}));
export var EnvironmentEnums;
(function (EnvironmentEnums) {
    EnvironmentEnums["local"] = "local";
    EnvironmentEnums["dev"] = "dev";
    EnvironmentEnums["test"] = "test";
    EnvironmentEnums["stage"] = "stage";
    EnvironmentEnums["prod"] = "prod";
})(EnvironmentEnums || (EnvironmentEnums = {}));
//# sourceMappingURL=enums.js.map