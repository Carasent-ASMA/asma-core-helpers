import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { htmlToPlainText, isHtmlFragment } from './htmlText.js'

describe('isHtmlFragment', () => {
    it('recognizes the marks TipTap actually emits', () => {
        assert.equal(isHtmlFragment('<p>hello</p>'), true)
        assert.equal(isHtmlFragment('<strong>bold</strong>'), true)
        assert.equal(isHtmlFragment('<em>italic</em>'), true)
        assert.equal(isHtmlFragment('<u>under</u>'), true)
        assert.equal(isHtmlFragment('<s>strike</s>'), true)
        assert.equal(isHtmlFragment('<ul><li>one</li></ul>'), true)
        assert.equal(isHtmlFragment('<ol><li>one</li></ol>'), true)
        assert.equal(isHtmlFragment('<h2>heading</h2>'), true)
        assert.equal(isHtmlFragment('<br>'), true)
    })

    it('recognizes markup carrying attributes', () => {
        assert.equal(isHtmlFragment('<p style="text-align: center">x</p>'), true)
        assert.equal(isHtmlFragment('<span class="a">x</span>'), true)
    })

    it('ignores leading whitespace before the first tag', () => {
        assert.equal(isHtmlFragment('\n  <p>hello</p>'), true)
    })

    it('rejects plain text, including text that merely mentions brackets', () => {
        assert.equal(isHtmlFragment('just text'), false)
        assert.equal(isHtmlFragment('5 < 7 and 9 > 2'), false)
        assert.equal(isHtmlFragment('a<b'), false)
        assert.equal(isHtmlFragment(''), false)
        assert.equal(isHtmlFragment('   '), false)
    })

    it('rejects RTF-conversion artifacts that look bracket-ish', () => {
        // Real values seen in RTF-converted documents; escapeNonTemplateXml exists because of these.
        assert.equal(isHtmlFragment('<å711,0,0>'), false)
        assert.equal(isHtmlFragment('<Pasientnavn>'), false)
        assert.equal(isHtmlFragment('<Some Tag With Spaces>'), false)
    })

    it('rejects non-string and empty inputs', () => {
        assert.equal(isHtmlFragment(null), false)
        assert.equal(isHtmlFragment(undefined), false)
    })

    it('detects markup that does not start at the first character', () => {
        assert.equal(isHtmlFragment('Intro text <strong>then bold</strong>'), true)
    })

    it('recognizes table markup, which pasted content can carry', () => {
        assert.equal(isHtmlFragment('<table><tr><td>a</td></tr></table>'), true)
    })
})

describe('htmlToPlainText', () => {
    it('returns non-HTML input byte-identical', () => {
        assert.equal(htmlToPlainText('just text'), 'just text')
        assert.equal(htmlToPlainText('5 < 7'), '5 < 7')
        assert.equal(htmlToPlainText('  spaced  '), '  spaced  ')
        assert.equal(htmlToPlainText('line one\nline two'), 'line one\nline two')
    })

    it('returns an empty string for nullish input', () => {
        assert.equal(htmlToPlainText(null), '')
        assert.equal(htmlToPlainText(undefined), '')
    })

    it('drops inline marks and keeps the text', () => {
        assert.equal(htmlToPlainText('<p><strong>bold</strong> and <em>italic</em></p>'), 'bold and italic')
    })

    it('turns paragraphs into newline-separated lines', () => {
        assert.equal(htmlToPlainText('<p>one</p><p>two</p>'), 'one\ntwo')
    })

    it('turns line breaks into newlines', () => {
        assert.equal(htmlToPlainText('<p>one<br>two</p>'), 'one\ntwo')
        assert.equal(htmlToPlainText('<p>one<br />two</p>'), 'one\ntwo')
    })

    it('prefixes list items with a dash', () => {
        assert.equal(htmlToPlainText('<ul><li>one</li><li>two</li></ul>'), '- one\n- two')
    })

    it('keeps headings as their own lines', () => {
        assert.equal(htmlToPlainText('<h1>Title</h1><p>body</p>'), 'Title\nbody')
    })

    it('decodes the entities TipTap emits', () => {
        assert.equal(htmlToPlainText('<p>a&nbsp;b</p>'), 'a b')
        assert.equal(htmlToPlainText('<p>&lt;tag&gt;</p>'), '<tag>')
        assert.equal(htmlToPlainText('<p>a&amp;b</p>'), 'a&b')
        assert.equal(htmlToPlainText('<p>&quot;q&quot; &#39;a&#39;</p>'), '"q" \'a\'')
    })

    it('collapses the blank lines empty paragraphs would leave', () => {
        assert.equal(htmlToPlainText('<p>one</p><p></p><p>two</p>'), 'one\ntwo')
    })

    it('degrades malformed markup to text rather than leaking tags', () => {
        assert.equal(htmlToPlainText('<p>unclosed'), 'unclosed')
        assert.equal(htmlToPlainText('<p>a</p><p>b'), 'a\nb')
    })

    it('keeps table cells apart instead of running them together', () => {
        assert.equal(htmlToPlainText('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'), 'a\tb\nc')
    })

    it('never leaves an angle bracket from a real tag behind', () => {
        const out = htmlToPlainText('<div><p>x</p><ul><li>y</li></ul></div>')
        assert.equal(out.includes('<'), false)
        assert.equal(out.includes('>'), false)
    })
})
