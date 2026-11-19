# ports.remote-gateway-host-name

- Status: active
- Since: unreleased
- Source: task HAL-12530, from the review of the phone's tunnel crate (HAL-12519); requirement `ports.remote-gateway-session`

The phone reads a host name in pairing message 2 as unreadable when it holds a control character, a line or paragraph separator, a bidi mark, embedding, override or isolate (U+061C, U+200E, U+200F, U+2028 to U+202E, U+2066 to U+2069) or an invisible character (U+200B, U+2060 to U+2064, U+FEFF), or when it is longer than 64 bytes of UTF-8. So the host shall send as its name in pairing message 2 its own name without those characters and without spaces at either end, cut at a whole code point to at most 64 bytes of UTF-8, with a lone surrogate as U+FFFD; and `Computer` when nothing is left. The zero width non-joiner and joiner shall stay, and every other character shall stay as it is.

## Examples

- Given a host name with a line break, a right-to-left override, an isolate, a zero width space or a byte order mark,
  when the host's name for pairing message 2 is made,
  then those characters are gone and the rest stays in its order.
- Given a host name in Persian with a zero width non-joiner, or an emoji with a zero width joiner,
  when the name is made,
  then it is the same name.
- Given a host name longer than 64 bytes of UTF-8,
  when the name is made,
  then it is the longest start of it, at a whole code point, of at most 64 bytes.
- Given a host name that is empty, only spaces or only characters the phone refuses,
  when the name is made,
  then it is `Computer`.
- Given any host name,
  when the name is made,
  then it passes the phone's rule.
