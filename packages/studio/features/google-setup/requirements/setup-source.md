# google-setup.setup-source

- Status: active
- Since: 0.1.0
- Source: HAL-711; [ux-checklists](/HAL/issues/HAL-1019#document-ux-checklists) section 1; Liam's plan review (HAL-6621)

When a workspace opens, the Google setup feature shall add a setup source to its Inbox that lists one entry for each connected Google account that needs you, and none for an account with nothing left to do. The entry's title and progress line shall follow the account's state: setting up ("Set up Google for x@example.com", "Step 4 of 7 · Scopes"), a service that failed its check ("Step 7 of 7 · 1 service to fix"), a sign-in Google refused ("Sign in to Google again for x@example.com", "Needs sign-in since 02:10"; the time reads as the Inbox says times: "02:10" today, "Sat 02:10" within the last 6 days, else "Tue 3 Nov, 02:10"), a client secret Google refused ("Replace the Google client secret for x@example.com", "Needs a new client secret") and a service added later ("Add Drive to x@example.com", "3 steps for Drive"). When routines wait for the account, a refused account's line shall end with "· n routines on hold". The step count and names shall come from the generated setup steps, never from a service's name. The entry's account ref shall be the setup record's random ref, never the address.

## Examples

- Given an account that finished steps 1 to 3,
  when the Inbox loads,
  then its item reads "Set up Google for x@example.com" and "Step 4 of 7 · Scopes".
- Given an account whose refresh token Google refused at 02:10 with 2 routines waiting,
  when the Inbox loads,
  then its item reads "Sign in to Google again for x@example.com" and "Needs sign-in since 02:10 · 2 routines on hold".
- Given an account whose refresh token Google refused 9 days ago at 02:10,
  when the Inbox loads,
  then its progress line reads "Needs sign-in since Tue 3 Nov, 02:10", not "since 02:10".
- Given an account whose setup is done and every service works,
  when the Inbox loads,
  then the source lists nothing for it.
