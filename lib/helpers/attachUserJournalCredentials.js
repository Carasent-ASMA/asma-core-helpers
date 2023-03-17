import { history } from '../global';
/* @__PURE__ */
export function attachUserJournalCredentials() {
    const URLSearch = new URLSearchParams(history.location.search);
    const brukerBrukerNavn = URLSearch.get('brukerBrukerNavn');
    const region = URLSearch.get('brukerRegion');
    const journal_user_id = URLSearch.get('brukerActNo');
    const urls = new URLSearchParams();
    if (brukerBrukerNavn && region && journal_user_id) {
        urls.append('brukerBrukerNavn', brukerBrukerNavn);
        // TODO add support for multiregions
        urls.append('region', region);
        urls.append('journal_user_id', journal_user_id);
    }
    const str_url = urls.toString();
    return str_url ? `&${str_url}` : '';
}
//# sourceMappingURL=attachUserJournalCredentials.js.map