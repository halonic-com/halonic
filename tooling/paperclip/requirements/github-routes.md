# paperclip.github-routes

- Status: active
- Since: unreleased
- Source: HAL-17604; section 1.5 of the phase 2 architecture note on HAL-17511 (D2), with Julian's security read on HAL-17540 (T1 and T2)

When a caller asks the Agent tools plugin's `GET /github/summary` or `GET /github/pr/{number}` route, the plugin shall answer only a signed-in board user, from the stored GitHub snapshot, the merge-speed record and the queue session's dequeue reasons alone, sending no request anywhere, and shall name the board's GitHub login as "the board", an agent by its branch and anyone else as "outside contributor", carry no comment or review text, cut titles, check names and dequeue reasons to their length cap, and answer 404 for a number that isn't a positive integer of at most 9 digits, without reading anything, or that isn't in the snapshot.

## Examples

- Given an agent's key,
  when it asks either route,
  then the plugin refuses with 403 and reads nothing.
- Given a snapshot where the board opened #5641 and a reviewer's comment on it says "[major] …" twice and "[nit] …" once,
  when a board user asks for the summary,
  then #5641's author is "the board", its review counts are 2 major and 1 nit, `takenAt` is the snapshot's, and no login or comment text is in the answer.
- Given the path numbers `1%2F..`, `0`, `-1` and `99999999` (not in the snapshot),
  when a board user asks for a pull request's detail,
  then each answer is 404 and no request is sent.
- Given a failing check named with 300 characters and a dequeue reason of 300 characters,
  when a board user asks for the pull request's detail,
  then both are cut to 120 characters.
