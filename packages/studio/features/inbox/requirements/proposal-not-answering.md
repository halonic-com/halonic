# inbox.proposal-not-answering

- Status: active
- Since: unreleased
- Source: HAL-10916; HAL-19449; flow-inbox 2.2; HAL-11945 section 3, row Q11 (engine not answering); `inbox.proposal-page`; `inbox.proposal-done`

While the Inbox's last load failed, an open run proposal shall show the host's "showing what it said last" line above its header, and its **Accept all**, **Reject all**, each change's **Accept** and **Reject**, **Try again** and **Remove from Inbox** shall stay but be unavailable (`aria-disabled`), naming that line as their reason, and send nothing to the host. When the served Studio's sign-in ended, the line shall say "Sign in again to send your answer." instead. When the engine answered the load with a refusal, the line shall give the same reason as the line over the list, followed by "Showing what was read last.", instead of saying the engine isn't answering.

When only the Done list fails to load, the Inbox shall keep Needs you and every proposal's buttons working, keep the done proposals it showed last, and say so under the **Done** heading: the host's "showing what it said last" over those rows, or, with none, "Couldn't load Done", the reason and **Try again**.

## Examples

- Given an open proposal of run `01JD8Q`,
  when the Inbox's next load fails,
  then the line "The engine isn't answering. Showing what it said last." sits above the header, and pressing **Accept** sends nothing.
- Given an open proposal of run `01JD8Q`,
  when the agent host refuses the Inbox's next load ("The agent host refused the read."),
  then the line "The agent host refused the read. Showing what was read last." sits above the header, and **Accept** names it as its reason.
- Given the Inbox loads but the Done list fails, with no done proposal shown before,
  when the person opens **Done**,
  then it says "Couldn't load Done" with the reason and **Try again**, and the open proposal's **Accept** still works.
