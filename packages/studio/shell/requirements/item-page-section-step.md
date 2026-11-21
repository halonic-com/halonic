# shell.item-page-section-step

- Status: draft
- Since: unreleased
- Source: HAL-15441 (C561 finding 4.2 of HAL-15313); `shell.item-page-sections`

`<Sections only={id} step={step} />` shall give the section it draws that `step`, so a page can ask a section for one of its parts, as `openItem`'s `step` asks an item's page. The shell shall name one step, `SECTION_ADD_STEP` ("add"), which asks the section to start adding as its own add button would. A step without `only` shall reach no section, and a section that doesn't know a step shall show as it would without one.

## Examples

- Given the models feature adds the sections Usage and Models on `plugin-panel`,
  when its page places `<Sections only="usage" step="add" />`,
  then Usage is given the step `add`.
- Given the same sections,
  when the page places `<Sections step="add" />`,
  then Usage and Models are drawn, and neither is given a step.
