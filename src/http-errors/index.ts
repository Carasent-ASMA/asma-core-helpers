/** Pure HTTP error formatting; safe to import without browser/auth initialization. */
export { _getServerErrorMessage, _processServerError } from '../helpers/_processServerError.js'
export type { HttpErrorMessageOptions } from '../helpers/httpErrorMessages.js'
export { readHttpErrorBody } from '../helpers/readHttpErrorBody.js'
