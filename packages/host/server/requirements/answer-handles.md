# server.answer-handles

- Status: active
- Since: unreleased
- Source: architecture design 16.3 and 16.4 (RO-4, RO-2); plan on HAL-20108, approved with amendments on HAL-20110 and HAL-20126

Where the server is built for many users, `POST /api/runs/<id>/events` shall take only a JSON body of exactly `{ handle, payload }`, never an event name, a call id or a state, and answer 400 `bad_request` for any other body. A handle shall stand for one waiting point of one run, as the run view gives it, and be stored in the scope's answer handle store with when the run started that wait. Handles shall be made from 32 random bytes of Web Crypto, and two readers of one wait shall get the same handle. A handle of another run or another scope, a spent handle and an unknown handle shall all get the same status and body, 404 `answer_not_found`, and so shall every handle when the scope has no answer handle store. A payload that doesn't have the shape of the handle's schema (`{ approved }` for an approval, `{ choice }` within the choices for a question, `{ text }` of 1 to 20,000 characters for a message) shall answer 400 `bad_request` and spend nothing. A handle shall answer once: the server spends it before it sends the answer to the run, with the approval's call id or the wait's state and start, so the engine refuses an answer to a wait that has moved on. The access rules of `server.run-access` shall apply first. A successful answer shall name the run, `{ id }`, never its summary.

Rationale: an end user must answer a run without learning or choosing how the workflow is built, so the deployment keeps what each answer means and the end user only names it.

## Examples

- Given a run waiting for approval of call `call-1` and its stored handle,
  when its starter sends `{ handle, payload: { approved: true } }`,
  then the engine gets `approve` for `call-1`, the answer is `{ id }`, and the same handle sent again answers 404 `answer_not_found`.
- Given a spent handle, an unknown handle and a handle of another run,
  when each is sent,
  then the three responses have the same status and the same body.
- Given a body that also names an `event`,
  when it is sent,
  then the answer is 400 and nothing reaches the engine.
- Given a question handle with two choices,
  when the payload is `{ choice: 2 }`,
  then the answer is 400 and the handle still answers `{ choice: 1 }`.
- Given two reads of one wait,
  when their handles are made,
  then both get the same handle, and a later wait at the same step gets a new one.
