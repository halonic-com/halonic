# runs.run-view.guided-wait

- Status: active
- Since: unreleased
- Source: HAL-13435 (first-run build 7); first-run-flow 3.5, approved by the board on HAL-7993

Where a run's card is given a guided run's **Pick another model**, such as the first run's, and a way to open the Inbox, when the run waits for the person (an answer to a wait step, or an approval), the card shall say "Waiting for you. It's in your Inbox." with one primary button, **Open Inbox**, in place of its usual banner, and **Open Inbox** shall open the Inbox at what the run waits on. The card shall not open the Inbox by itself. The sentence shall be in a polite status region that is on the card before the run waits, so a screen reader hears it when it comes, and the button shall sit outside that region. A card without the guide, or without a way to open the Inbox, shall show its banners as before.

## Examples

- Given the first run's Support reply waiting at its review step,
  then its card says "Waiting for you. It's in your Inbox." with Open Inbox, and not "Waiting for you: Approve this reply?".
- Given the same card while the run is still running,
  then the status region is there and empty, and there is no Open Inbox.
- Given a run waiting at a step on a card that isn't guided,
  then the card shows its usual banner.
