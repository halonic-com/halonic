# shell.home-problems-section

- Status: active
- Since: unreleased
- Source: HAL-16787 (part 2b of HAL-14903); C348 on HAL-14317, option A, ST5 and A6

The shell shall let one feature add Home's Problems section through `home.addCard` with the section `problems`, and shall show it first on Home, before Get set up and Needs you, with the `h2` "Problems" and, when its card can't load, the title "Couldn't load problems". While the Problems section's card loads, the shell shall show no skeleton, since the section shows only while a file has an error.

## Examples

- Given _inbox_ adds Needs you and _files_ adds Problems, registered in that order,
  when Home is shown,
  then its sections read Problems, Needs you.
- Given Problems' card fails to load,
  when Home is shown,
  then Problems shows "Couldn't load problems" with Try again.
- Given Problems is still loading,
  when 300 ms have passed,
  then the section shows no skeleton.
