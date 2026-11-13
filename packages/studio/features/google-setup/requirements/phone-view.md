# google-setup.phone-view

- Status: active
- Since: 0.1.0
- Source: HAL-712; google-setup-flow (HAL-621) section 6 (Phone); ux-checklists (HAL-1019) section 2.6

On a phone, the Google setup view shall be read-only. It shall be a page titled "Google for x@example.com", whose first line says "Set this up on a computer. Google Cloud Console is hard to use on a phone." It shall show three rows, Account, For and Progress, then every step's title and state, and the current step shall add "Continue on a computer." It shall have no buttons and no fields: no **Edit**, **Copy**, **Done, next**, **Not now**, **Change** or **Start over**. The steps shall come from the generated steps, so their number and order follow them.

## Examples

- Given a phone and an account with steps 1 and 2 done,
  when the item opens,
  then the page is titled "Google for x@example.com", the rows read Personal Google account, For Gmail and "2 of 7 steps done", and step 3 says "Continue on a computer."
- Given a phone,
  when the item opens,
  then it has no button.
- Given a computer,
  when the item opens,
  then it shows the checklist as before.
