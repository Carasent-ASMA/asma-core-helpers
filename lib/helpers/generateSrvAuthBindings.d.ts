import { AxiosRequestConfig, AxiosResponse, ResponseType } from 'axios';
import { EnvironmentEnums } from '..';
export type feature_names_enum = 'artifact_createQnrCustomContext' | 'autoImportableQnr' | 'calendar_BusyTimesAccess' | 'calendar_CoursesAccess' | 'calendar_EventsAccess' | 'calendar_EventsRequestsAccess' | 'calendar_TasksAccess' | 'calendar_access' | 'calendar_taskTemplatesCRUD' | 'dashboardTraceability' | 'directory_AdvocaCandidatProfile' | 'directory_AdvocaInvormationOnTiltak' | 'documentUploadFromAdopusPicker' | 'documentUploadFromDokkladPicker' | 'documentUploadFromLocalPicker' | 'documentUploadPickedDocuments' | 'experimental' | 'ordersOverviewOnSelectedRecipientsForQnr' | 'predefinedUserForQnr' | 'rejectableQnr' | 'signByTherapistDocument';
export declare function generateSrvAuthBindings(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, EnvironmentToOperateFn: () => string, logout?: () => void): {
    hasFeature: (featureName: feature_names_enum) => boolean;
    getFeatures: () => Set<feature_names_enum> | undefined;
    isJwtValid: () => boolean;
    signin: (url: string, headers?: Record<string, string>) => Promise<{
        token: string;
        features: feature_names_enum[];
    }>;
    srvAuthGet: <R>(url: string, headers?: Record<string, string>) => Promise<AxiosResponse<R, any>>;
    signoutAuth: () => Promise<void>;
    setReqConfig: <T = unknown>(data?: T | undefined, responseType?: ResponseType) => Promise<AxiosRequestConfig>;
    getJwtTokenAsync: () => Promise<string>;
    getNewJwtToken: () => Promise<string>;
    getUserId: () => string;
    getParsedJwt: <R_1 = {
        user_id: string;
        exp: number;
    }>() => R_1 | undefined;
    getJwtToken: () => string;
    accessTokenHasExpired: () => boolean;
};
/**
 * @deprecated use generateSrvAuthBindings
 * @param SRV_AUTH
 * @param DEVELOPMENT
 * @param ENVIRONMENT_TO_OPERATE
 * @param logout
 * @returns
 */
export declare function generateSrvAuthBindingsMicroApp(SRV_AUTH: () => string, DEVELOPMENT: () => boolean, ENVIRONMENT_TO_OPERATE: () => EnvironmentEnums, logout?: () => void): {};
//# sourceMappingURL=generateSrvAuthBindings.d.ts.map