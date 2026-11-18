# shell.overview.phone-head

- Status: draft
- Since: unreleased
- Source: HAL-12214 (A7, from the UX check HAL-12213); HAL-12278; UX checklist section 0 (phone) and 9.12

When the window is a phone, the overview page shall give the search field the whole line, so its placeholder isn't cut. Where the page is under the phone's top bar, the overview page shall put the feature's create button there as a 48px **+** named with the button's label, after **Search**, and nothing under the search field; elsewhere it shall put the create button under the search field at 48px high.

## Examples

- Given the page is under the phone's top bar and the feature passes a "New skill" button, then the top bar shows a 48px **+** named "New skill", and nothing sits under the search field.
- Given the window is a phone with no top bar and the feature passes a "New skill" button, then the button is 48px high and sits under the search field.
- Given the window is a desktop, then the button stays after the search field on the same line.
