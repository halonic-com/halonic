# Decision: one sentence when Windows can't start the sandbox helper, Windows' message in Copy details

- Approval: HAL-15013 (Sofia's wording decision C525-7 of 21 Nov, from her design check of #4303 on HAL-14999)
- Kind: user-visible
- Task: HAL-15013; Liam signs this note in review

When the shell couldn't start the sandbox helper, or couldn't wait for it once it had started, Settings › Agent sandbox read "The sandbox isn't set up: Windows couldn't start the sandbox helper: Access is denied. (os error 5)." and the Inbox toast said the same. The part after the second colon is Rust's `io::Error` text. That breaks the approved rule (microcopy 1.6 and 22 F13): one reason after the colon, an error code never stands alone, and a raw message goes only into **Copy details**. HAL-14863 decided the refused, time-out and still-running lines, not this one; Sofia decided it as the designer, a line on an approved screen (HAL-2282).

The section now reads "The sandbox isn't set up: Windows couldn't start Halonic's sandbox helper." and the toast's cause "Windows couldn't start Halonic's sandbox helper." for both cases. Windows' message and code go into the outcome's `details`, so the Callout offers **Copy details** instead of **Try again**, as it already does for any failure with details.

`studio.sandbox-setup-through-shell` (draft) gets the new sentence and an example; `settings.agent-sandbox-state` says a failure with the system's own message offers **Copy details**, with an example. The shell test now expects the new sentence and the details; no test is removed or weakened, and a new test covers the Callout.

## Covers

- studio.sandbox-setup-through-shell
- settings.agent-sandbox-state
