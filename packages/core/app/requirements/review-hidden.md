# app.review-hidden

- Status: active
- Since: 0.1.0
- Source: Liam's plan review on HAL-3286 (changes 1 and 2); HAL-3277

The workspace store that everything but the review service uses shall leave `.halonic/review/` out of every listing and refuse to read, write or remove there with a `RangeError`, matching the folder's name however its case, trailing dots or ignored code points are written. Its version shall be a content hash of the files it lists, made as the folder and memory adapters make theirs, so a change to a review record alone never gives a new version.

## Examples

- Given a workspace with `agents/clerk.agent.yaml`, `hubs/p/.halonic/source.json` and a review record,
  when the files are listed,
  then the list has the first two and not the record.
- Given the same,
  when the record is read, written or removed through that store, also as `.Halonic/REVIEW/…`,
  then each is refused with a `RangeError` and the record is unchanged.
- Given the version of that workspace,
  when only review records change,
  then the version stays the same; when `agents/clerk.agent.yaml` changes, it changes.
