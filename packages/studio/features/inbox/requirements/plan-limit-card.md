# inbox.plan-limit-card

- Status: active
- Since: unreleased
- Source: HAL-14163 (S3-11), HAL-19122 (Noah's check on HAL-19110: the still-at-limit line), Elena's plan approved by Liam on 26 Nov, PR 2 on HAL-19051; flow C3 (HAL-12484, revision 7) with Sofia's changes (HAL-13563); board 10, round 5 (HAL-13521); builds on `app.run-plan-stop` and `engine.plan-limit-wait`

When a run waits at a limit of its customer's plan (`plan.<unit>` or `plan.member.<unit>`), the Inbox shall list it and open it as C3's card, not as a wait step's: the chip "Waiting: plan limit reached", the title "This run stopped: you've used this month's {unit}", the line "It resets on {day}." and **Continue the run**, which sends `continue` to the run without naming a wait step. A unit reads as the customer reads it (flows, section 0): the cost unit as "usage", never money, and `harnessMinutes` as "agent time". When a step's reservation was refused, the title shall be "This step can't start: not enough {unit} left this month" and the line "It needs up to {needed}% of your monthly {unit} and you have {left}% left. It resets on {day}.", with "less than 1%" when under 1% is left. A member's share shall read as the customer's own limit.

- **Continue the run** shall always be there. When the run still waits at a plan limit after it, the card shall stay as it was, with no new error, and a quiet line over its buttons, also said to a screen reader, shall read "This run is still at your plan's limit. It resets on {day}.", without the second sentence when the stop gives no day. When the run goes on, the card shall say "The run continues." or "The run finished.", as the wait card does, or "The run ended without finishing." when it ended another way.
- In S3 no plan is bigger, so the card shall offer no Upgrade and say nothing about upgrading. Until Halonic Cloud sends the seller's name and support contact, the line shall leave out C3's contact sentence.
- Where the Studio has an account menu (a served Studio with Cloud sign-in), the card shall have **See usage**, which opens the account page's plan; elsewhere it shall have none.
- The row shall have the card's title and shall not say "a person step" or when the run moves on: a waiting run that nobody continues fails after 7 days.
- C3's other run messages shall have their words with these ones, for the screens that show ended runs: "This run stopped for good" with "Failed" after 7 days, "You have 2 runs going, the most your plan allows at once" and "You don't have a plan right now · You need a plan to start runs." with "Not started". The seller's own limits (`budget.run`, `budget.month`, a step's limits) and a paused account have no such message and fail as today.

Rationale: a run at a plan limit waits rather than fails (`engine.plan-limit-wait`), so the customer needs to read why and continue it where they see what waits for them. The served Studio shows waiting runs only in the Inbox. The engine keeps the time of the run's last `wait` step, not of the limit, so naming a wait step would refuse `continue`; a late `continue` changes nothing.

## Examples

- Given a run waiting at `plan.cost` with 100% used and `resetsAt` 2 December,
  when its item opens,
  then the card reads "Waiting: plan limit reached", "This run stopped: you've used this month's usage" and "It resets on 2 December.", with **Continue the run** and no Upgrade.
- Given that card,
  when **Continue the run** is pressed,
  then `continue` is sent to the run with no wait step named.
- Given that card and a run that still waits at `plan.cost` after `continue`,
  when **Continue the run** is pressed,
  then the card reads as before, with no error, and the line "This run is still at your plan's limit. It resets on 2 December." shows over its buttons and is said to a screen reader.
- Given a run waiting at `plan.harnessMinutes` whose step needed 8% and had 3% left,
  when its item opens,
  then the title is "This step can't start: not enough agent time left this month" and the line "It needs up to 8% of your monthly agent time and you have 3% left. It resets on 2 December."
- Given a served Studio whose account menu gives the plan's address,
  when **See usage** is pressed,
  then the account page's plan opens.
