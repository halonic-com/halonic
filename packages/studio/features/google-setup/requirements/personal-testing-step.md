# google-setup.personal-testing-step

- Status: active
- Since: unreleased
- Source: HAL-18663; google-setup-flow (HAL-621) revision 12, sections 2.3, 3.2 ("Step 3 for personal accounts"), 3.3 and 3.6; the board's choice on HAL-18554

Where a personal app is in *Testing*, the Google setup view shall number six steps, with no Scopes step, and its header shall say, before step 1, "With a personal account, Google ends the sign-in every 7 days, so you'll sign in again once a week. It takes about a minute, and Studio reminds you the day before." with a folded **Why?**. Step 3 shall add, as its part c, 'On "Audience", under "Test users", click "Add users", add your address and click "Save".' with the Audience page link, the address with **Copy** and the note that the status stays "Testing"; its required tick shall read '*address* is listed under "Test users"', with "Without it, Google blocks your sign-in in step 6.". A folded **Why not publish?** in step 3, and **Why?** in the header, shall show the same text, with **Publish with my own pages**, which saves `publishing: production`. Published, step 3 shall show the Branding fields to fill in and **Publish app**, the tick 'The status says "In production"' and **Stay in Testing instead**, which saves `publishing: testing`; the item shall then number seven steps and the header shall have no weekly line. A Workspace account shall keep seven steps and no weekly line. A second account on a shared app in *Testing* shall get step 3 as "Add *address* under Test users." with only part c, lettered c, and its tick. A service added later to a personal app in *Testing* shall read "2 steps for *service*".

## Examples

- Given a personal account in *Testing*, when the item opens, then the header says "With a personal account, Google ends the sign-in every 7 days" and the progress says "Step 1 of 6".
- Given a Workspace account, then the header has no such line and the progress says "Step 1 of 7".
- Given step 3 in *Testing*, when you tick "x@example.com is listed under "Test users"", then "test-user" is saved; until then **Done, next** waits.
- Given step 3 in *Testing*, when you choose **Publish with my own pages**, then "publishing: production" is saved, and once saved the tick reads "The status says "In production"" and the item has seven steps; **Stay in Testing instead** switches back.
- Given a second account on a shared app in *Testing*, then step 3 says "Add x@example.com under Test users." with one action.
- Given a personal app in *Testing* with Ledger working and Atlas added, then the Inbox entry says "2 steps for Atlas".
