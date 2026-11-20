# google-setup.connector-badges

- Status: active
- Since: unreleased
- Source: HAL-11595; Sofia's rows A6 to A8 on HAL-11945; HAL-715; google-setup-flow (HAL-621) section 5.2; ux-checklists (HAL-1019) section 5

The Google setup feature shall show, through the shell's header badges, one badge for each Google account whose connector needs a sign-in again ("Needs sign-in again") or a new secret ("Needs new secret"), with the label and tone the library gives that state, below the trust badge and with the secret before the sign-in. Each badge shall have the button **Fix**, which opens that account's setup item in the Inbox, and shall go when the account no longer needs it. The badge shall not name the account; its tooltip shall. 

It shall also show one badge for each Google API the runs say is switched off: "Gmail API off" or "Drive API off", with the tone the library gives `api-off`, below the sign-in badge, with the one-line tooltip "Google's Gmail API is off in project *halonic-x*." (without a project: "… in your Google project."). A run knows it, so the badge comes from the newest real run that failed with the typed cause `google.api-disabled` and never from a free-text reason. It shall open that run's page, where **Switch it on** is, and no Inbox row. It shall go when a later real run of the same workflow ends without that cause, or when no Google account is left, and never with time or because the page was opened. A run does not name its Google account, so the workflow stands for "the same run".

## Examples

- Given an account whose sign-in Google refused,
  when the window opens,
  then a "Needs sign-in again" badge shows, and **Fix** opens that account's setup item in the Inbox.
- Given an account whose client secret Google refused,
  when the window opens,
  then a "Needs new secret" badge shows, left of any "Needs sign-in again" badge.
- Given a badge for an account,
  when the account signs in again,
  then the badge goes.
- Given an account that is connected or was never set up,
  when the window opens,
  then no badge shows for it.
- Given a real run that failed with the cause `google.api-disabled` for Gmail,
  when the window opens,
  then a "Gmail API off" badge shows, below any "Needs sign-in again" badge, and pressing it opens that run's page.
- Given that run and a later real run of the same workflow that succeeded,
  then the badge is gone.
- Given a failed run whose reason mentions an API but which has no typed cause,
  then no badge shows.
