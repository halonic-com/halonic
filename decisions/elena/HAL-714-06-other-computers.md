# Decision: on a phone, step 7 says where the sign-in is done

- Approval: the text is in the board-approved Google setup design, section 3.5 item 10 (HAL-621), and in the UX checklist 4.7 (HAL-1019); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-714

## What changes

`google-setup.phone-view` says that on a phone the current step 7 shows the text of `google-setup.sign-in-elsewhere` instead of "Continue on a computer.". Every other step still says "Continue on a computer.". Nothing was removed or weakened.

## Why

Step 7 can only be finished on the computer that runs Halonic, because Google sends the sign-in back to it. "Continue on a computer." was too vague there: it did not say which computer, or that the command `halonic google sign-in` can do it.

## Covers

- google-setup.phone-view
