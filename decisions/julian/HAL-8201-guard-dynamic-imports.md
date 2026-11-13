# Decision: the guard import test also fails on dynamic loads

- Approval: HAL-1337, the board's design for guarded trust roots, which this closes a gap in; follow-up of the check of halonic#2360 on HAL-8199
- Kind: user-visible

The test that keeps the guard commands to a short list of packages only read top-level `import` and `export ... from` lines. A dynamic `import(...)`, a `require(...)` or a `createRequire` in a guard command, or in a file it loads, could load a package without the test seeing it. The test now also fails on the common forms of those in the files it walks, with a literal argument or not, because it can't follow them. Comments and the text of plain string literals are ignored, so prose can mention them. Only the test changes; the guard commands themselves are unchanged.

This is a text scan, not a parser, so it stops an honest slip, not a hostile edit. It does not see `require?.(x)`, an alias such as `const r = require; r(x)`, `process.binding` or `process.dlopen`, or a load built from strings (`globalThis["req"+"uire"]`, `new Function(...)`). A quote inside a regex literal can hide the rest of its line, and a static `import ... from 'x'` with single quotes is still skipped (old gap from #2360; biome keeps the files on double quotes). The two guardians sign knowing these limits.

## Covers

- tooling/check/
- check.guard-two-guardians
