# library.listed-tools-changed-columns

- Status: active
- Since: 0.1.0
- Source: HAL-2213 part 2; Noah's frames T10-F33 to F48 (HAL-2882, approved in HAL-2896)

The Library feature shall show a tool that changed since it was approved with one labelled line per changed text, the **Approved version** beside the **New version**, stacked on a phone. Words taken out shall be struck through and words added underlined. A change a person can't see shall get one warning line that says why, and a tool whose text is the same but whose server connects differently shall get a plate that says so.

## Examples

- Given a changed description,
  when the row shows,
  then the approved version marks the removed words and the new version marks the added words, under the text's path.
- Given a change that only swaps a look-alike letter, normalises characters, changes spaces or adds invisible characters,
  when the row shows,
  then one warning line says which, in the words of the catalogue.
- Given a text that is new or was removed,
  when the row shows,
  then the missing side says "(none)" or "(removed)".
- Given a tool whose text is the same but whose server's address, version or settings changed,
  when the row shows,
  then a plate says the server connects differently and no columns show.
