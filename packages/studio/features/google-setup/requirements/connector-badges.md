# google-setup.connector-badges

- Status: active
- Since: 0.1.0
- Source: HAL-715; google-setup-flow (HAL-621) section 5.2; ux-checklists (HAL-1019) section 5

The Google setup feature shall show, through the shell's header badges, one badge for each Google account whose connector needs a sign-in again ("Needs sign-in") or a new secret ("Needs new secret"), with the label and tone the library gives that state, below the trust badge and with the secret before the sign-in. Each badge shall have the button **Fix**, which opens that account's setup item in the Inbox, and shall go when the account no longer needs it. The badge shall not name the account; its tooltip shall. The "API off" badge comes with the run banner (HAL-1845), because only a run knows it.

## Examples

- Given an account whose sign-in Google refused,
  when the window opens,
  then a "Needs sign-in" badge shows, and **Fix** opens that account's setup item in the Inbox.
- Given an account whose client secret Google refused,
  when the window opens,
  then a "Needs new secret" badge shows, left of any "Needs sign-in" badge.
- Given a badge for an account,
  when the account signs in again,
  then the badge goes.
- Given an account that is connected or was never set up,
  when the window opens,
  then no badge shows for it.
