# Decision: allow `@types/react` in tooling-paperclip for the seats page

- Approval: /HAL/issues/HAL-16008 (Liam's OK on the 6a review of #5251)
- Kind: internal
- Task: HAL-16008

## What changes

`tooling/check/dependencies.json` allows `@types/react` in `@halonicjs/tooling-paperclip` and the tooling layer, next to the Studio packages that use it today.

## Why

The seats plugin's page (#5270) is written in TSX against the plugin SDK's components and needs React's types to typecheck. Paperclip's own page provides React at run time, so the page's bundle leaves React out and the package doesn't depend on `react` itself, only on its types, as a dev dependency. Liam OK'd React for this page on HAL-16008. CI checks dependencies against the base commit's list, so the entry lands on its own before the page.

## What doesn't change

`react` itself stays allowed only in the Studio and apps layers. No package's dependencies change in this pull request.

## Covers

- tooling/check/
