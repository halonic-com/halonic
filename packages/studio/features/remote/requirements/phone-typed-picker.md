# remote.phone-typed-picker

- Status: draft
- Since: unreleased
- Source: HAL-18138 (typed route's computer picker on the nearby port from HAL-16823; strings table on HAL-12233, `phone.pair.typed.*`, G10, G11, G23 and the `p-m5` screen-reader rows)

When the phone shows Type a code, it shall list as a "Computer" radio group the computers it finds on this Wi-Fi ("This Wi-Fi") and the computers it paired with before ("Paired before"), with the Code field and Pair, and shall browse for computers on this Wi-Fi only while that screen shows, stopping when it leaves. Pair shall stay unavailable, with its reason, until a computer is chosen and the code has 12 characters. A computer found on this Wi-Fi shall be sent by its id only, so the shell keeps its address. While no computer on this Wi-Fi is listed, the phone shall say once that it is looking, and after 5 seconds that none was found yet, while it keeps looking. When Nearby devices isn't allowed, the phone shall say under the list how to allow it, the way Android still allows, in place of the looking lines. After a wrong code, Type a code shall show the same computer and code again with the error. "Not listed? Enter its address" shall stay under the list.

## Examples

- Given Tim's laptop is found on this Wi-Fi,
  when the person picks it, enters 12 characters and presses Pair,
  then the pairing starts with the typed code and Tim's laptop's id, not an address.
- Given no computer is found on this Wi-Fi yet,
  when Type a code opens,
  then it says "Looking for computers…", and 5 seconds later that no computers were found yet.
- Given Nearby devices was turned down and Android will still ask,
  when Type a code opens,
  then the hint under the list says to open this screen again and choose Allow.
- Given Type a code shows,
  when the person leaves it,
  then the phone stops looking for computers on this Wi-Fi.
