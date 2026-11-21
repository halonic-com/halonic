# agents.map.lines-and-fit

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 (T12 revision 29, Fit); house style 5 and 8 (HAL-5554); UX checklist 9.9

The agents feature shall join each card on a side of the agent map to the centre card by a straight, orthogonal line, which leaves the card's edge straight, turns at square corners halfway across the gap and enters the centre card's port straight, or is one straight segment when the two ports line up, and which ends in a ring-and-dot port on each card's facing edge, with its own port on the centre card for every line, drawn as a picture that screen readers and the pointer pass over, and shall fit the map to its panel, never larger than its natural size and no smaller than half of it, when the map opens and again 260 ms after the panel stops changing size, with no zoom buttons.

## Examples

- Given the agent "Mail triage" run by "Support reply", handed work by "Sorter", using "Tone" and "Acme mail" and handing work to "Writer", then the map shows 5 lines with 10 ports; the add buttons and the agent step "classify" have none.
- Given a card on the left whose middle is level with its port on the centre card, then its line is one horizontal segment; given it sits higher, then its line runs right to halfway across the gap, down, and right into the port, with no curves.
- Given two cards on the left, then their lines reach the centre card's left edge at a third and two thirds of its height.
- Given a map 896 pixels wide in a panel 448 wide, then it shows at half size; when the panel grows to 1200, it shows at its natural size, centred, 260 ms after the last resize.
- Given the map is fitted, then there is no Zoom in, Zoom out or Fit button.
