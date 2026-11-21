# shell.stacked-cards

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `cards.open-on-top`, `cards.go-back`, `cards.no-motion` and `cards.docked-card` (HAL-110); component specs 16, K6 (HAL-175); UX checklist part 1, 1.10 (HAL-1323); visual review kit T6-F3, F4 (HAL-1115); a11y 6.5 (HAL-950); the named ← on a narrow card (Sofia with Noah, HAL-14707)

The shell's `StackedCards` shall draw an item page's card stack (`shell.card-stack`) over its view: the top card with a **←** named "Back", a breadcrumb named "Card path" and a **✕** named "Close all cards" while more than one card is open, else "Close", then the card's title, and the cards shown behind it as bands that sit 10px higher and 12px narrower on each side per step back, with no motion. While a full card is open, the shell shall dim the view with the stack scrim and make it inert. Where a docked card is the only card, the shell shall draw it at the panel's right without dimming the view, and in a panel under 720px over the whole panel. When the user presses Esc, **←** or the scrim, the shell shall close the top card; when the user picks a breadcrumb part or a band, the shell shall go back to that level, the item's own name closing every card; and when the user presses **✕**, the shell shall close every card. Where the top card is narrower than 30rem, the shell shall draw, in place of **←** and the breadcrumb, one **←** that shows the name of the level it goes back to, the item's own name on the first card, and is named "Back to" and that name, and shall wrap the card's title instead of cutting it. When a card opens, its title shall take the focus, named with its path; when a card closes, the focus shall go back to what opened it, or to the title of the card now on top when that is gone. Esc shall close a card only on the tab's page that is shown.

## Examples

- Given agent "Writer" in hub "Acme Mail" with card "draft-reply" open,
  then the card's title is focused and named "draft-reply, in Acme Mail › Writer › draft-reply",
  and the view under it is inert.
- Given cards "draft-reply" and "Run r-42",
  when the user picks "Writer" in the breadcrumb,
  then both cards close.
- Given cards "draft-reply" and "Run r-42",
  then **✕** is named "Close all cards";
  and given only card "draft-reply", it is named "Close".
- Given 4 cards,
  then the top card and 2 bands show.
- Given card "draft-reply" opened from the map's "draft-reply" button,
  when the user presses Esc,
  then the card closes and the focus is back on that button.
- Given docked card "triage" in a 900px panel,
  then the view stays usable and isn't dimmed.
- Given docked card "triage" in a 700px panel,
  then the card covers the panel and the view is inert.
- Given cards "draft-reply" and "Run r-42" in a card 360px wide,
  then the header shows "← draft-reply" named "Back to draft-reply" and **✕**, with no breadcrumb,
  and the title is still named "Run r-42, in Acme Mail › Writer › draft-reply › Run r-42";
  and when the user presses it, "Run r-42" closes and the next one reads "← Writer".
- Given a card open on a tab's page that isn't shown,
  when the user presses Esc,
  then that card stays open.
