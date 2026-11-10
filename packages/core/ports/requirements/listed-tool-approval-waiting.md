# ports.listed-tool-approval-waiting

- Status: draft
- Since: 0.1.0
- Source: HAL-2210 step 3, from the HAL-2579 test cases (D8): a server that lists new names on every call must not fill the profile. It becomes active with `ports.listed-tool-approval`.

The `ToolApprovalStore` adapters shall keep the waiting versions they note by one rule, `keptWaitingVersions`. The time the noted version was first seen counts as now. A version first seen more than 24 hours before it is dropped, and so is a tool left with none. A fingerprint still noted keeps its first `firstSeenAt`; otherwise the version is added as the newest. Each tool keeps its newest 8 versions (`maxWaitingVersions`), and each source the 256 tools whose newest version was first seen most recently (`maxWaitingTools`), the one just noted always among them; among tools whose newest versions were first seen at the same time, the one first in UTF-16 code-unit order is dropped first. A version whose `firstSeenAt` isn't a date is refused. Dropping only ever makes the host ask again; it never offers a tool.

## Examples

- Given `lookup` noted at fingerprint A at 00:00 and B at 01:00,
  when A is noted again at 02:00,
  then the versions are A at 00:00 and B at 01:00.
- Given 10 different versions of `lookup` noted one after the other,
  when the versions are read,
  then they are the newest 8.
- Given `lookup` noted at A at 00:00 on 9 November and `search` at 00:00 the same day,
  when `lookup` is noted at C at 00:00 on 10 November and then at A at 01:00,
  then `lookup` holds C and A at 01:00, and `search` is gone.
- Given `lookup` noted at 00:00 and 256 other names noted at 01:00,
  when the waiting versions are read,
  then `lookup` is gone and the source holds 256 tools.
- Given a version whose `firstSeenAt` is `soon`,
  when it is noted,
  then it is refused.
