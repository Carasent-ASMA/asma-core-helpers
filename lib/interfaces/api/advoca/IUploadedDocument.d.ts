export interface IUploadedDocument {
    created_at: string;
    customer: {
        comm_consents_descr: string;
        contact_email: string;
        contact_message: string;
        contact_tel: string;
        id: number;
        logo: string;
        name: string;
        updated_at: string;
    };
    customer_id: number;
    id: number;
    name: string;
    path: string;
    patientIds: {
        id: number;
        soknad_id: string;
    }[];
    region: number;
    sds_id: number;
    updated_at: string;
    upload_patient_id: number;
    success: string;
}
//# sourceMappingURL=IUploadedDocument.d.ts.map