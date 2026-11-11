# app.run-proposal-accept-reject-part

- Status: active
- Since: 0.1.0
- Source: engine answer 2 on HAL-3267 ("per part through `applyPatch`"); AI changes 2 and 1.2 (per part); req-inbox `inbox.proposal.accept-and-reject`; HAL-3248

When the person accepts one part of a file a run modified (one line change from the saved file to the run's text less what was rejected), the proposal service shall write the saved file with that part applied, through a write that expects what the saved file held (the run's base before any part was accepted). When the person rejects one part, it shall take that part out of the run's text and leave the saved file alone. Once no part is left, the file shall be accepted if the person accepted any part of it, and rejected if not. Rejecting the rest of a partly decided file as a whole shall settle it the same way. If the parts were worked out from texts that changed since, or the part isn't there, it shall change nothing and say the parts are stale. If the person changed the saved file since, it shall write nothing and list the file under `changedOnDisk`. A file the run added or deleted shall be decided as a whole. Each call shall give back one undo step: the file it wrote, if any, and the decisions record, before and after. Accepting the rest of a partly decided file shall write what is left of the run's text, and Compare shall show that text as the run's.

## Examples

- Given run `01JD8Q` changed lines 1 and 3 of `agents/clerk.agent.yaml`,
  when the person accepts the first part,
  then the saved file has the run's line 1 and its own line 3, and the only part left is line 3.
- Given the same,
  when the person rejects the first part,
  then the saved file is unchanged and the only part left is line 3.
- Given the person accepted the first part and rejects the second,
  then the file is accepted with only the first part in it.
- Given the person accepted the first part,
  when they reject the rest of the file as a whole,
  then the file is accepted with only the first part in it.
- Given the person rejected both parts,
  then the file is rejected and the saved file is unchanged.
- Given the person accepted one part since the parts were shown,
  when they click Accept on the old list,
  then nothing changes and the answer is stale.
- Given the person edited `agents/clerk.agent.yaml` after run `01JD8Q` started,
  when they accept a part,
  then nothing is written and the file is listed under `changedOnDisk`.
- Given run `01JD8Q` added `notes/today.md`,
  when the person accepts a part of it,
  then nothing changes and the answer is that it is decided as a whole.
