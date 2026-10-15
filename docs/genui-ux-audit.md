# Generated pages: UX audit

Date: 2026-10-15. What was audited: the pages the agent draws with `render_ui`
(`web/public/js/genui.js` and `web/public/js/scenes/generated.js`).

## How

Six sample specs went through `window.agentOS.openScene('generated', { spec })`
in Playwright (Chromium) at 1440x900 and at 390x844. A script then measured
these things:

- the scene's horizontal overflow (`scrollWidth - clientWidth`)
- tap targets (buttons, links, inputs) smaller than 44x44 px
- text contrast against the nearest background, counting opacity, checked
  against WCAG AA (4.5:1, or 3:1 for large text)

The sample specs were a to-do list with due dates and tags plus one very long
word, web search results with sources, first aid with a call button, a
stats/progress page, a page with a chart and an image, and the dark accent
with every block type. Screenshots were checked by eye. None are committed.

At 1440x900 the app draws a 390 px phone frame, so both sizes gave the same
findings. The list below holds for both.

## Faults found

### Hierarchy and primary action

- Two filled buttons compete. The spec's `button` is a full-width solid block,
  and the "I like it" chip under it is solid too. Nothing says which one is
  the main action.
- If a page has two `button` blocks, both are drawn as large solid buttons.
- The first `text` block, usually the answer, looks the same as body text, so
  the page does not start with its answer.
- The proposal chips have no label. It is not clear they are the agent's
  "change this page?" question.

### Spacing

- Block margins are 6, 8, 10, 12 and 14 px, depending on the block type, so the
  gaps between blocks are uneven.
- Stats are inline boxes that wrap, so three stats on a phone end up as 2 plus
  1, with uneven widths.
- In charts, a column with a long label gets wider than the others (8 bars:
  "Saturday morning" is twice the width of "Mon").
- A chart has no baseline. Values are raw (`4100`, not `4,100`).

### Overflow and truncation

- One long word in a checklist item pushes the row 520 px past the screen. The
  tag and the due date go off screen and the page scrolls sideways.
- Long strings are cut hard in the middle of a word with no `…`.
- Due and tag sit at the right edge of the row and leave little room for the
  item text on a phone.

### Tap targets (under 44 px)

- Proposal chips: 37 px tall.
- Source links: about 17 px tall (only the text line can be tapped).
- `field` input: 41 px tall.

### Contrast (under WCAG AA)

- White text on the orange accent (badge, button, "I like it" chip): 2.57:1.
  Green 3.25, blue 3.68, purple 4.35, pink 3.96: all fail for 12-18 px text.
- The tags "High" (4.17) and "Medium" (3.98) are 11 px text.
- A done checklist item at opacity .55 is 3.58:1.
- Dark accent:
  - steps rows stay white with light text (1.16:1)
  - the badge, button and like chip have white text on light orange (1.76:1)
  - the sources box stays light
  - the status bar clock and icons turn dark on dark

### Empty and over-long blocks

- Empty `text`, `list`, `steps`, `chart` or `card` blocks still draw (a blank
  paragraph or an empty box).
- A checklist with no items draws nothing and says nothing.
- A tag the model writes freely (for example "Urgent!!") becomes a CSS class
  name and gets no colour.
- A failed image keeps a large 16:9 grey box, which takes half the phone screen
  for an icon.

## Not faults

- First aid page: steps, the red 1669 button and the hierarchy are clear. The
  only fault is the badge contrast (3.96).
- Nothing on any page uses `innerHTML`: everything goes in with `textContent`.
