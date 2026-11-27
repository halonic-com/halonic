# studio.src-tauri.risky-answer-confirm

- Status: draft
- Since: unreleased
- Source: architecture note HAL-17491, section 6.8 condition 2 (revision 17), decided on HAL-20274; plan on HAL-20278, approved by Liam, with Julian's additions; task HAL-20441

When the page calls `agent_host_request` with `POST /v1/messaging/answer` and the agent host answers 409 `needs_confirmation` with a `confirmation` whose digest is 64 lowercase hex characters, the shell shall show its own native dialog, built from that confirmation only: who asks and the item's title, then the agent, the secret with its setting path, the adapter and the environment variables by name, each saying whether it gets a secret, with how many more there are, each on one line and at most 200 characters, and the answer picked. Only when the person approves shall the shell send `POST /v1/messaging/answer-confirmed` itself, with the page's body and that digest, and pass the page the host's answer. If the person doesn't approve, then nothing more shall reach the host and the page shall get the refusal `declined`. Any other answer, a malformed ask included, shall reach the page as the host gave it. The page's route table shall not hold `POST /v1/messaging/answer-confirmed`, so the shell refuses a page's call to it as `unknown_route` before anything reaches the host.

## Examples

- Given the host asks for the yes on Ada's request to hire Iris with `ACME_DEPLOY_TOKEN` bound to a secret,
  when the person cancels the dialog,
  then the host hears nothing more and the page gets `declined`.
- Given the same ask,
  when the person approves,
  then the shell sends `answer-confirmed` with the host's digest and the page gets the host's answer.
- Given the page calls `POST /v1/messaging/answer-confirmed`,
  then the shell refuses it as `unknown_route` and starts no host.
