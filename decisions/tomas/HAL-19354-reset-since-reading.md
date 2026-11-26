# Decision: a seat that reset since its reading counts as empty

- Task: HAL-19354
- Approval: the board's done-when on HAL-19354 ("nobody parked while a legal seat exists"), and the shadow log on HAL-16116 on 26 Nov, where the mover kept Nora on the Iris seat at "5h 100%" eight minutes after that seat's 5-hour window had reset. Liam approves the change in review on HAL-19354.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Yg8b5x/Csb7O0lSKNBmsIMfVZ9VDUkv7dYuHgwK9RYgGbSGCdn8PsYeZmsax46/VCUPa50zChXDphYBZxmaXBA==

## What changes

Seat readings come only at :17 and :47. Until now a reading kept its 5-hour and weekly use
until the next one, even after the window it reports had reset. A seat that reset at :49
looked full for half an hour: nobody was moved onto it, and the agents on it were moved off.

Now a window whose reset, as the reading reports it, falls after the reading was taken and is
already past counts as 0% until the next reading. The 10% headroom per agent sent to a seat
still applies to a reset seat.

A reset time with no day (the 5-hour window's, such as `1:15am (UTC)`) that is more than an hour
before its reading is now read as the next day. Before, a reading at 23:47 put a 1:15 reset
on the same day, in the past.

## Tests

`readings.test.ts` gains two tests, one for each change. Both fail on the code before this
change. No test or assertion is removed.

## Covers

- paperclip.seat-mover-job
