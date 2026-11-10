# app.listed-tool-review

- Status: active
- Since: 0.1.0
- Source: HAL-2210 (HAL-850 step 5), from the adversarial cases on HAL-2579 (rows F9, G2) and the CLI and Studio check on HAL-2842 (T4, T11, T12), for `ports.listed-tool-approval`

The app shall give one review of a source's listed tools, which Studio and the CLI both only format: the tools to ask about, those with an approval ("Changed") before those without one ("Not approved"), each in listing order; the tools Halonic refused, with why; and the tools their server keeps changing, which are shown but not asked about. A tool that waits only because the source now points at another server, with the same text, is marked as such, so the person isn't shown "Changed" over no changes. When the whole listing is refused, or one of the source's approvals can't be read, the review says so, naming the tool whose approval it is when it can be told.

The app shall let a person approve one waiting listed tool by the name its server lists it under, and, when the person gives the fingerprint they were shown, only at exactly that fingerprint: if the tool is waiting at another fingerprint, nothing is approved and the person is told the current one. Approving by name also works for a tool its server keeps changing, as `ports.listed-tool-approval` asks.

The app shall list what changed in a waiting tool since it was approved, one entry per text that differs, with the approved and the current text. It shall mark a change a person can't see on screen: the same text in another Unicode normal form, a difference only in white space such as a trailing space, and a difference only where one side has a character outside ASCII, such as a Cyrillic look-alike. A change in a value that isn't text, such as `required`, `enum` or a limit, is listed too.

## Examples

- Given `lookup` waiting at fingerprint A,
  when the person approves `lookup` by name without a fingerprint,
  then it is approved at A.
- Given `lookup` waiting at fingerprint B, and the person gives fingerprint A,
  when they approve `lookup` by name,
  then nothing is approved and the result names B.
- Given `lookup` approved already, `look up` refused and no tool called `lokup`,
  when the person approves each of them by name,
  then nothing is approved, and the results say `lookup` is approved already, `look up` was refused and why, and `lokup` isn't listed, with the names that are.
- Given an approval of the source that can't be read,
  when the person approves any of its tools by name,
  then nothing is approved and the result names the tool whose approval can't be read.
- Given `lookup` changed since its approval, `archive` and `pick` never approved, `look up` refused and `search` changed by its server more than 3 times in 24 hours,
  when the source is reviewed,
  then it asks about `lookup` (Changed) and then `archive` and `pick` (Not approved), shows `look up` as refused with why, and shows `search` as keeping changing without asking.
- Given `lookup` approved, and the workspace now points the source at another URL,
  when the source is reviewed,
  then `lookup` is Changed, marked as waiting because its server changed, with no changes in its text.
- Given `search` waiting, and its server keeps changing it,
  when the person approves `search` by name,
  then it is approved at the fingerprint shown.
- Given an approved description `Finds a note.` and a new one with a Cyrillic `о` in `note`,
  when the changes are listed,
  then the description is listed as changed and marked as a look-alike.
- Given an approved description `café` in NFC and a new one in NFD,
  when the changes are listed,
  then it is marked as another normal form.
- Given an approved description and a new one with only a trailing space added,
  when the changes are listed,
  then it is marked as white space.
- Given an approved tool and a new one whose description says more, and whose parameters gained an `enum` and lost a `required`,
  when the changes are listed,
  then each of the three is listed, unmarked, with its text before and after.
