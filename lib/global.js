import { createBrowserHistory } from 'history';
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
//import type { IGenerateSRVAuthBindings } from './helpers/generateSrvAuthBindings'
export {};
export const history = window.__ASMA__SHELL__?.history || createBrowserHistory();
export { createBrowserHistory };
//# sourceMappingURL=global.js.map