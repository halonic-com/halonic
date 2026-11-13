# Decision: the guard import test also fails on dynamic loads

- Approval: HAL-1337, the board's design for guarded trust roots, which this closes a gap in; follow-up of the check of halonic#2360 on HAL-8199
- Kind: user-visible

The test that keeps the guard commands to a short list of packages only read top-level `import` and `export ... from` lines. A dynamic `import(...)`, a `require(...)` or a `createRequire` in a guard command, or in a file it loads, would load a package without the test seeing it. The test now also fails on any of those in the files it walks, with a literal argument or not, because it can't follow them. Comments and the text of plain string literals are ignored, so prose can mention them. Only the test changes; the guard commands themselves are unchanged.

## Covers

- tooling/check/
- check.guard-two-guardians
