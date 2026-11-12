# studio.src-tauri.crates.trust-grant.trust-grants

- Status: draft
- Since: 0.1.0
- Source: HAL-2612; Liam's plan approval on HAL-2652; the question's wording decided with Sofia on HAL-2653; Julian's test cases on HAL-2820 (section B); the Windows folder keys (B6) on HAL-3747; picked folders across restarts decided by Liam on HAL-6637, and the Unix identity and the cap on read on HAL-7039

The shell shall add a folder to the opened folders, the one list git and the file commands share, only from a choice the person makes in the shell: a folder they pick in the folder dialog, or the folder of a trust grant that is inside a picked folder or that they say yes to when the shell asks. A grant shall save its record and open its folder only then. The shell shall refuse a grant whose location isn't the folder's canonical path in the form the CLI keys its records by (`invalid_record`) or isn't a folder (`folder_unreadable`), and shall not rewrite it. It shall compare a location with the picked folders by path part, and a folder a grant opened shall not count as picked. The question shall show the canonical path with control, invisible and text-direction characters written out and a long path shortened in the middle. The shell shall show one dialog at a time and refuse a grant or a pick that would show a second as `busy`. The folder a grant or a pick opens shall be the canonical path the shell checked, not canonicalised again, so a link swapped in while the question shows can't change it. Revoking trust shall close that exact folder and delete the record, so git refuses the folder at once unless a folder still open, such as a picked folder, holds it.

The shell shall remember each folder the person picks, by its canonical path and, on Unix, its device and inode, in a list in the profile that only a pick adds to, most recently picked or reopened first and at most nine. On Unix it shall not remember a pick whose device and inode it can't read. After a restart it shall open a remembered folder again, as a picked folder, only when the page names exactly a location in the list and that location is still the same canonical path and, on Unix, the same device and inode; on Unix an entry without them shall be refused as `folder_changed`. Otherwise it shall refuse it, keeping the entry, as `not_picked` when the location isn't in the list, `folder_missing` when nothing is at it any more, `folder_changed` when it leads to another folder or the folder was made again, and `folder_unreadable` for anything else. Forgetting a folder shall drop it from the list and close the folder opened for that location, if any, and shall keep its trust record; forgetting one that isn't there shall succeed. The shell shall replace the list's file through a temporary file and a rename, shall read a file it can't read or parse as an empty list, and shall read only the first nine entries of a longer one.

## Examples

- Given the picked folder `work/acme`,
  when the page grants `work/acme/hubs`,
  then the record is saved and the folder opened without a question.
- Given the picked folder `work/acme`,
  when the page grants `work/acme-evil`,
  then the shell asks "Trust this folder?", showing the folder's path, and saves and opens it only after Trust.
- Given the folder `Halonic Work` on Windows,
  when the person picks it as `halonic work` or by its 8.3 short name `HALONI~1`,
  then its location is `…\Halonic Work`, the key the CLI's `realpath` gives, and a grant that names it `…\halonic work` is refused as `invalid_record`.
- Given the picked folder `work/acme`,
  when the page grants `work/acme/../other`,
  then the grant is refused as `invalid_record`, with no question.
- Given the question about `work/other` showing,
  when the page swaps `work/other` for a link to the home folder and the person says Trust,
  then `work/other` as checked is opened, and git is still refused in the home folder.
- Given a question already showing,
  when the page grants another folder outside the picked ones or asks for the folder dialog,
  then it is refused as `busy`.
- Given the granted folder `work/other`,
  when the page revokes it,
  then git is refused there and the record is gone.
- Given the path `/work/acme\u{202e}dm.exe`,
  when the question shows it,
  then it reads `/work/acme\u{202e}dm.exe` with the escape written out.
- Given the picked folder `work/acme` and a restart,
  when the page reopens `work/acme`,
  then it is open again without the dialog, and a grant inside it needs no question.
- Given the picked folder `work/acme` and a restart,
  when the page reopens `work/other` or `work/acme/hubs`,
  then it is refused as `not_picked`.
- Given the picked folder `work/acme`, replaced by a link to `work/other`,
  when the page reopens `work/acme` after a restart,
  then it is refused as `folder_changed`, and `work/acme` stays in the list.
- Given the picked folder `work/acme`, deleted since,
  when the page reopens it,
  then it is refused as `folder_missing`.
- Given the picked folder `work/acme`, trusted,
  when the page forgets it,
  then it is closed and gone from the list, and its trust record stays.
- Given a list file, written by hand, whose entry for `work/acme` has no device and inode, on Unix,
  when the page reopens `work/acme` after a restart,
  then it is refused as `folder_changed`, and the entry stays.
- Given a list file that isn't valid JSON,
  when the page reopens a folder after a restart,
  then it is refused as `not_picked`.
