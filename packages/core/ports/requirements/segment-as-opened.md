# ports.segment-as-opened

- Status: active
- Since: 0.1.0
- Source: Liam's review of halonic#951 on HAL-3344 (nit 4: one segment clean-up, not a copy); HAL-3277

The ports package shall export `segmentAsOpened`, which gives a path segment the way the private-entry rule compares names: without the code points HFS+ ignores, with case folded as any file system might fold it, and without trailing dots and spaces, so a store or decorator that keeps another folder to itself matches its name the same way.

## Examples

- Given the segment `.Halonic. .`,
  when `segmentAsOpened` is asked for it,
  then it is `.halonic`.
- Given the segment `.hal\u200Conic` (with a zero-width non-joiner),
  when `segmentAsOpened` is asked for it,
  then it is `.halonic`.
- Given the segment `.\u017Ftudio` (with a long s),
  when `segmentAsOpened` is asked for it,
  then it is `.studio`.
