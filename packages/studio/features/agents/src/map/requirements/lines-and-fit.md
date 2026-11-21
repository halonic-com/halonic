# agents.map.lines-and-fit

- Status: draft
- Since: unreleased
- Source: HAL-13180; HAL-15063; HAL-15064; HAL-15341 (C560); flow-agents 6 (T12, Fit); UX checklist 9.9

The agents feature shall join each card on a side of the agent map to the centre card by a straight line that leaves each card's facing edge straight, turns at square corners, below the centre card in the free space under the first row, and ends in a ring-and-dot port on each card's facing edge, on whole pixels and in line where the two ports are less than 8 pixels out of line, with its own port on the centre card for every line, drawn as a picture that screen readers and the pointer pass over, and shall fit the map to its panel, never larger than its natural size and no smaller than 0.8 of it on the desktop and never smaller than its natural size on the phone presentation, when the map opens and again 260 ms after the panel stops changing size, with no zoom buttons.

## Examples

- Given the agent "Mail triage" run by "Support reply", handed work by "Sorter", using "Tone" and "Acme mail" and handing work to "Writer", then the map shows 5 lines with 10 ports; the add buttons and the agent step "classify" have none.
- Given two cards on the left, then their lines reach the centre card's left edge at a third and two thirds of its height.
- Given a map 896 pixels wide in a panel 448 wide on the desktop, then it shows at 0.8 of its size and the panel scrolls; when the panel grows to 1200, it shows at its natural size, centred, 260 ms after the last resize.
- Given the same map and panel on a phone, then it shows at its natural size and the panel scrolls.
- Given a card on the left whose middle is higher than its port on the centre card, then its line goes right, turns down halfway, and goes right again into the port.
- Given the left side ends in "+ Add trigger" lower than the centre card, then the lines to the cards below turn halfway between "+ Add trigger" and the heading of what it can use, not along the button.
- Given "Writer"'s middle is 4 pixels off its port on the centre card, then its line is one straight line at the centre port's height; 8 pixels or more off, it turns.
- Given the centre card's middle port at 526.5 pixels across and "Refund policy"'s middle at 526, then both ports are at 527 and the line down is straight.
- Given the map is fitted, then there is no Zoom in, Zoom out or Fit button.
