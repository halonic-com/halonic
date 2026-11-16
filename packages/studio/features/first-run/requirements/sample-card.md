# first-run.sample-card

- Status: active
- Since: 0.1.0
- Source: HAL-1308 (T15); flow-first-run 3.3 (revision 15); microcopy 5

While the open workspace is remembered on this device as the Acme sample, the First Run feature shall fill Home's Get set up slot with the card **Try the sample**: the line "*N* of 3 done" above three steps, **Start a support request**, **Approve or reject the reply** and **See what it did**, each with its hint under it, a number before it and a tick in its place once done, and read after its title as "done". In any other workspace the slot shall stay empty. A step shall be done once a real run of the `support-reply` workflow has started in the workspace (step 1), once one of those runs has had an answer sent to a wait step (step 2), and once the page of one that finished has been shown (step 3); the steps can be done in any order and by any route, and a step shall stay done, also after a restart, because the card saves each as soon as it is seen on this device. Step 1 shall open the Inbox with the request form shown and focus in Message; step 2 shall open the newest wait card in the Inbox, and the request form when none waits; step 3 shall open the latest finished run's page, and before one exists do what the next open step does. When all three are done, the card shall say "You've seen it work." in place of the steps.

## Examples

- Given the Acme sample with no runs,
  when Home opens,
  then the section "Try the sample" reads "0 of 3 done" and lists the three steps, numbered.
- Given a workspace that isn't the sample,
  when Home opens,
  then Get set up's slot shows nothing.
- Given a test run of the support workflow,
  when the card reads the runs,
  then step 1 isn't done.
- Given a real support run that has started,
  when the card reads the runs,
  then step 1 is done and the card reads "1 of 3 done".
- Given a support run whose log holds an answer to its wait step,
  when the card reads it,
  then step 2 is done.
- Given a finished support run whose page was shown,
  when the card reads the runs,
  then step 3 is done, and when all three are, the card reads "You've seen it work."
- Given step 1 was done in an earlier session,
  when the workspace opens and no run is listed yet,
  then step 1 is still done.
- Given no request is waiting,
  when you open step 2,
  then the Inbox opens on the request form.
