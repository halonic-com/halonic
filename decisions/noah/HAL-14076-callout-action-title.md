# Decision: a Callout's focused action is described by its title, then its text

- Task: HAL-14076
- Approval: a kit detail of the approved Callout (HAL-1289), decided by the team on HAL-14076 (HAL-2282)
- Kind: user-visible

The requirement widens one promise and narrows none: an action with `focus` was described by the
Callout's text alone, so a screen that moved focus to "Try again" read the line but not the title
that says what happened, and a Callout with a title and no line gave its action no description at
all ("Try again, button"). The action is now described by the title, then the text, leaving out
whichever is missing, and has no description when both are missing. No new words. No test was
weakened: the test for a Callout without a title still reads the text alone, and two new tests
check a title and text ("The code ran out | A code works once…") and a title alone ("Couldn't
make a code").

## Covers

- kit.callout
