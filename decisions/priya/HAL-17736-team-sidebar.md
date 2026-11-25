# Decision: the Team group in the sidebar and table 1.6's offline and seat rows

- Approval: Liam approved the plan on HAL-17712, including these requirement changes
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fLC7J5RjSaeUxNPFISCqu1Ac4jmkNiRa0Wpp/2EDLMlzRrNJUgj9j4ZUzoar4d0zYPZf9RhflfSfN+Tmcf2dDQ==

The requirement shell.sidebar-places gains a ninth place, Spend and seats, in a Team group whose heading the shell owns, and a `problems` signal shown as "! 2"; nothing it already said is weakened or removed, and the old examples and tests stay as they are, with "Spend and seats" added to the list of names. The requirement team.spend-and-seats (not released yet, `Since: unreleased`) gains Sofia's table 1.6 rows for the offline cache, a failed seat read and runs with no known seat, the link buttons turned off under the Offline banner, the banner's time as the last good reading, and the sidebar signal; each has an example and a `verifies` test.

## Covers

- shell.sidebar-places
- team.spend-and-seats
