# google-setup.resume-and-start-over

- Status: active
- Since: 0.1.0
- Source: HAL-712; google-setup-flow (HAL-621) sections 3.3 and 3.6; ux-checklists (HAL-1019) sections 2.5 and 9 (U5, U6)

When the Google setup view opens on a setup with steps done, it shall open at the first step not done, with the finished steps folded, and say at the top "You started this on 8 Nov. Steps 1–3 are done." (the days and the step numbers from the record and the generated steps). At the bottom it shall say "Studio keeps your progress. You can close this at any step." and offer **Start over** as a plain link. **Start over** shall ask "Start the Google setup over? Halonic deletes the saved client ID and secret and stops using them. Your Google Cloud project stays as it is." with **Start over** (danger) and **Cancel**, focus starting on **Cancel**. When other accounts use the same client, the question shall name this account and say "The client secret stays, because y@example.com uses it." Choosing **Start over** shall ask the host to start the account's setup over, close the question and open step 1 with its title in focus. **Cancel** shall change nothing and return focus to the link. If the host can't, the question shall stay open and say "Couldn't start over. Try again." While the engine isn't answering, the link shall be unavailable with the reason as visible text. The view never talks to Google.

## Examples

- Given an account that finished steps 1 to 3 and was started on 8 Nov 2026,
  when the item opens,
  then it says "You started this on 8 Nov. Steps 1–3 are done." and step 4 is open.
- Given an account with no step done,
  when the item opens,
  then there is no "You started this" line.
- Given the open item,
  when you choose **Start over**,
  then the question shows with **Cancel** in focus and nothing is started over yet.
- Given the question is open,
  when you choose **Cancel**,
  then it closes, nothing is started over and **Start over** has focus.
- Given the question is open,
  when you choose **Start over**,
  then the host is asked to start that account's setup over, the question closes and step 1's title has focus.
- Given the host can't start over,
  when you choose **Start over**,
  then the question stays open and says "Couldn't start over. Try again."
- Given another account y@example.com uses the same client,
  when the question shows,
  then it says the client secret stays because y@example.com uses it.
- Given the engine isn't answering,
  when the item shows,
  then **Start over** is `aria-disabled` and its reason is shown.
