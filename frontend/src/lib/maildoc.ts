// maildoc.ts builds the stylesheet for the reading iframe's document.
//
// It is separate from MailBody.svelte so the fallback colours can be tested.
// They are easy to get wrong and hard to notice, because they only show up on
// text that declares no colour of its own:
//
//   The sanitizer strips the sender's style block. A message whose whole
//   stylesheet is `p{color:#333333}` therefore arrives with paragraph tags that
//   say nothing at all about colour, and every one of them renders in whatever
//   this document sets on body. A real QWeather activation mail is built exactly
//   that way, so a fixed dark default here put its body copy - and the
//   activation code the reader actually needs - at 1.04:1 on a darkened page.
//
// The colours below are the client's own, not the sender's, which is why they
// are chosen here rather than by the darkening pass: there is no sender
// declaration for that pass to rewrite. They come from the same palette the
// darkening pass repaints in, so fallback text is indistinguishable from the text
// around it instead of being a grey the theme never chose.

import { type MailPalette } from './mailpalette'

/** The reading document's own colours, for text that declares none. */
export interface DocumentColors {
  /** body colour, inherited by text with no colour of its own */
  text: string
  /** link colour, for an anchor the sender did not colour itself */
  link: string
  /** blockquote colour, for a quote the sender did not colour itself */
  quote: string
  /** the rule a blockquote is marked with, which the document supplies */
  rule: string
}

// The link colour is the one role the palette does not carry, because a message is
// not app chrome: a mail link has to stay recognisably a link, and it must not be
// mistaken for the sender's own brand colour, which the darkening pass
// deliberately leaves alone. The dark value is the app's own dark link role.
const DARK_LINK = '#7fb2ff'
const LIGHT_LINK = '#1a56db'

// The blockquote rule: decoration inside the message that the document owns,
// because the sender did not style the quote itself.
const DARK_RULE = '#4a4d54'
const LIGHT_RULE = '#94a3b8'

/**
 * The document colours for a palette. Light mail keeps the values this document
 * has always used, so nothing changes for a light theme.
 */
export function documentColors(palette: MailPalette): DocumentColors {
  if (!palette.dark) {
    return { text: palette.text.hex, link: LIGHT_LINK, quote: palette.muted.hex, rule: LIGHT_RULE }
  }
  return { text: palette.text.hex, link: DARK_LINK, quote: palette.secondary.hex, rule: DARK_RULE }
}
