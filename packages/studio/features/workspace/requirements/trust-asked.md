# workspace.trust-asked

- Status: draft
- Since: unreleased
- Source: HAL-13135 (Routines › Run now); HAL-13143 (C144 RT1 and TR1, decided by the designer on the task)

When a start is refused because the shown workspace isn't trusted yet and asks for the trust check (Routines' Run now, the Run panel's and the run page's **Review**), the window shall open the same trust check as the header badge's **Review**, with **Not now** focused, also in a window as narrow as a phone, where no badge shows. **Trust** shall answer that the workspace is trusted; **Not now** and Escape shall answer that it isn't and save nothing. With nothing to show (before the first check, or a workspace that needs no trust), the answer shall be that it isn't trusted, at once. When the check closes, focus shall go back to what opened it; when that is gone, as the badge is once the workspace is trusted, focus shall go to the page's `h1`.

## Examples

- Given an untrusted workspace "Acme" and a start that asks for the check,
  when the person presses **Trust**,
  then trust is saved for the fingerprint shown and the start hears "trusted".
- Given the same, when the person presses **Not now**,
  then nothing is saved and the start hears "declined".
- Given a workspace whose check hasn't answered yet,
  when a start asks,
  then it hears "declined" and no dialog opens.
- Given a phone-narrow window with an untrusted workspace,
  when a start asks,
  then the trust check opens.
- Given the person opened the check from the badge "Not trusted yet · Review" and pressed **Trust**,
  when the badge goes,
  then focus is on the page's `h1`, not on the body.
