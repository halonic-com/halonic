# Decision: on a phone, a collection renames from ⋮ and its title is for screen readers only

- Task: HAL-13651
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13651 (decided by the team under HAL-2282, Sofia as designer; follows the approved phone layout 1.1 and the routine page's phone rename)
- Kind: user-visible

Under a phone's top bar, which already names the collection, the collection page now does what the
skill, knowledge and connector pages do: its `h1` holds the plain name, is `sr-only` and keeps
`tabIndex={-1}` for Undo, and no title row is drawn. Renaming moves into ⋮, which reads **Rename** ·
**Open as file** · **Delete** there. **Rename** opens the routine page's rename sheet, which moves
to the shell as `RenameSheet` so both pages share it and its words ("Rename _kind_", Name,
"Give it a name."); the routine page's behaviour and words don't change. A failed rename still says
"Couldn't rename the collection." on the page. The desktop is unchanged: the name field stays and ⋮
has no Rename. `library.collection-page` and `library.library-phone` say this, with examples for the
sheet; the new `shell.rename-sheet` describes the sheet. No new words, and no test was weakened.

## Covers

- library.collection-page
- library.library-phone
