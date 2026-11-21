# studio.src-tauri.crates.owner-check.owner-check

- Status: draft
- Since: unreleased
- Source: HAL-15194, board decision 4b (HAL-5276), D7 section 2 (HAL-15159)

Before the phone sends an answer to an approval, the shell shall ask the person for a strong (Class 3) biometric in a new prompt for that one answer, with words the shell picks from the decision (approve or deny) and no text from a page or a host, and shall send the answer only when the prompt reports a pass. If the phone runs an Android older than 11, has no strong biometric, has none enrolled, is locked out, or the platform's answer is anything other than a pass, then the shell shall send nothing. A pass shall never cover a later answer. Only the shell shall ask for the prompt; no page shall be granted the commands.

## Examples

- Given a phone with a strong fingerprint enrolled,
  when the person approves from the phone and passes the prompt,
  then the answer is sent, and the next answer shows a new prompt.
- Given a phone with a strong fingerprint enrolled,
  when the person closes the prompt or Android closes it,
  then nothing is sent.
- Given a prompt that is open,
  when the app leaves the screen, or nobody answers within 2 minutes,
  then nothing is sent, and the next answer shows a new prompt.
- Given a phone whose only biometric is a weak face unlock,
  when the person approves from the phone,
  then no prompt shows and nothing is sent.
- Given the plugin answers with text the shell doesn't know,
  when the shell reads it,
  then it reads as unavailable and nothing is sent.
- Given the connect page or the served Studio,
  when it calls `plugin:owner-check|confirmOwner` or `plugin:owner-check|ownerCheckStatus`,
  then the shell refuses it.
