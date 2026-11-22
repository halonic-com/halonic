# kit.halonic-mark

- Status: active
- Since: unreleased
- Source: HAL-16050; design decisions 42, 91 and 92 (HAL-8416), `brand/masters/halonic-mark.svg`

The kit's `HalonicMark` shall draw the Halonic ring in a 100-unit viewBox, with a band 16% of the diameter and one gradient from `#3175f2` at the bottom left to `#1bc6c8` at the top right, at `size-icon-md` unless it's given another size. Each mark shall use a gradient id of its own, so that two marks on a page never share one. Given a `label`, the mark shall be an image with that name; without one, it shall be hidden from screen readers.

## Examples

- Given `<HalonicMark />`,
  when it renders,
  then it is 20px and hidden from screen readers.
- Given `<HalonicMark label="Halonic Studio" />`,
  when it renders,
  then screen readers read it as an image named "Halonic Studio".
- Given two marks on one page,
  when they render,
  then each ring points at its own gradient.
