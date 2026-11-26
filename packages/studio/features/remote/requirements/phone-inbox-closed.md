# remote.phone-inbox-closed

- Status: draft
- Since: unreleased
- Source: HAL-20106 (Julian's review of #6658; the Studio's final state for a closed card from HAL-19496, words from `kit.final-state`)

When the host says a card closed without an answer, cancelled or expired, before the phone's answer got there, the phone's card shall settle as the Studio's card does: it shall say the kit's final-state line ("Cancelled · <time>" or "Expired · <time>"), keep its options turned off, and show Next.

## Examples

- Given an open card,
  when the person picks Today and the host says the card expired,
  then the card says "Expired" with the time, not "Answer this on your computer.", every option is turned off, and Next goes back to the Inbox.
