/**
 * Rich-text values (TipTap output) are stored as HTML strings. Consumers that are not rich-text
 * interpreters — plain inputs, titles, document merge fields — need to tell markup from ordinary
 * text and render it readably. These helpers are the single implementation of both.
 *
 * No DOM: this runs in the browser apps and in the Bun backend that generates documents.
 */

/** The subset TipTap's StarterKit emits, plus the containers it wraps them in. */
const KNOWN_TAGS = [
    'p',
    'br',
    'div',
    'span',
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'strike',
    'del',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'a',
    // Not emitted by StarterKit, but pasted content and legacy values carry tables; without them
    // a table would fail the sniff and reach the user as visible markup.
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
] as const

/**
 * Matches an opening/closing/self-closing tag from KNOWN_TAGS only.
 *
 * Deliberately narrow: legacy values carry RTF-conversion artifacts (`<å711,0,0>`) and document
 * merge placeholders (`<Pasientnavn>`) that are bracket-shaped but must never be treated as markup.
 */
const KNOWN_TAG_PATTERN = new RegExp(String.raw`<\s*/?\s*(?:${KNOWN_TAGS.join('|')})(?:\s[^<>]*)?/?\s*>`, 'i')

/** Any tag-shaped run, used for stripping once a value is known to be markup. */
const ANY_TAG_PATTERN = /<[^<>]*>/g

const BLOCK_BOUNDARY_PATTERN = /<\s*\/?\s*(?:p|div|h[1-6]|blockquote|pre|ul|ol|tr)(?:\s[^<>]*)?\/?\s*>/gi
const LINE_BREAK_PATTERN = /<\s*br(?:\s[^<>]*)?\/?\s*>/gi
const LIST_ITEM_PATTERN = /<\s*li(?:\s[^<>]*)?\s*>/gi
/** Cells are separated rather than newline-split, so a row stays one line. */
const TABLE_CELL_PATTERN = /<\s*\/\s*(?:td|th)\s*>(?=\s*<\s*(?:td|th)[\s>])/gi

const ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
    [/&nbsp;/gi, ' '],
    [/&lt;/gi, '<'],
    [/&gt;/gi, '>'],
    [/&quot;/gi, '"'],
    [/&#0*39;|&apos;/gi, "'"],
    // Ampersand last, so `&amp;lt;` decodes to `&lt;` rather than to `<`.
    [/&amp;/gi, '&'],
]

const decodeEntities = (value: string): string =>
    ENTITIES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value)

/**
 * Whether a value should be treated as an HTML fragment.
 *
 * Conservative by design — a false positive corrupts a legitimate plain value, while a false
 * negative only leaves today's behaviour unchanged.
 */
export function isHtmlFragment(value: string | null | undefined): boolean {
    if (typeof value !== 'string' || value.length === 0) return false

    return KNOWN_TAG_PATTERN.test(value)
}

/**
 * Renders an HTML fragment as readable plain text, preserving structure: blocks and `<br>` become
 * newlines and list items gain a leading dash.
 *
 * Values that are not markup are returned **byte-identical** — callers may pass anything.
 */
export function htmlToPlainText(value: string | null | undefined): string {
    if (typeof value !== 'string' || value.length === 0) return ''
    if (!isHtmlFragment(value)) return value

    const withStructure = value
        .replace(LINE_BREAK_PATTERN, '\n')
        .replace(LIST_ITEM_PATTERN, '\n- ')
        .replace(TABLE_CELL_PATTERN, '\t')
        .replace(BLOCK_BOUNDARY_PATTERN, '\n')

    return decodeEntities(withStructure.replace(ANY_TAG_PATTERN, ''))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line !== '-')
        .join('\n')
}
