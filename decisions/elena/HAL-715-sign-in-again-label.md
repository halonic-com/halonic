# Decision: the sign-in chip reads "Needs sign-in again"

- Approval: Liam's decision on HAL-715 (16 Nov), from the approved Google setup flow design 5.2 and Mara's words check (HAL-8749)
- Kind: user-visible

The chip and status word for a refused sign-in read "Needs sign-in again", as the approved design says. The library's table and the Google setup badge and facts said "Needs sign-in", which drifted from it. The label, its tests and the README change in one place, and four requirements name the new word.

The `google-setup.connector-facts` requirement also drops its note that the chip lives in the library view (the chips are now header badges), and says the API-off chip and banner moved to their own task.

"Needs sign-in since …" in the setup item's progress line is a different line and stays.

## Covers

- library.connection-state
- library.status-section
- google-setup.connector-facts
- google-setup.connector-badges
