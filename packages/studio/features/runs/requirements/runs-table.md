# runs.runs-table

- Status: active
- Since: unreleased
- Source: HAL-20989; design HAL-20742, `SCREENS.md` (final) section 2, picture `runs-a-table`, option A picked by the board on 28 Nov 2026

While no run is open in the Runs page's content pane (`runs.list-column`), the pane shall show a header with the Runs icon, "All runs" and "A run is one time a workflow or agent does its job." under it, then every run the list column holds as a table under the column names "Status", "Run", "What ran", "Started by" and "Started", newest first under a heading per day the runs started in the user's time zone, "Today" for today, then "Yesterday", then the date. Each row shall show the run's status chip in the Runs page's look, with a dot while the run is running or needs someone and on a failed run's chip, as the Runs page draws them, and none while it waits, is queued or has ended otherwise, its short id, what ran with the run's line under it, what started it, with the routine's name as a tooltip for a run a schedule started, and the time it started on the user's clock with "took …" under it once it has ended. The line of a failed run shall be in the danger colour, and the line and chip of a run that couldn't try shall keep their neutral look, as on the Runs page. Where the source doesn't say who started a run, such as a Paperclip team's run, its Started by cell shall be empty. When the person clicks a row of the table or presses Enter on it, the content pane shall show that run's page, the focus shall move to the page's first button, and the run shall count as opened; when the person Ctrl-clicks, Cmd-clicks or middle-clicks a row, the Studio shall open the run's page in a new tab and leave the table showing. While no run is listed and some source hasn't answered yet, the pane shall show the Runs page's loading rows under the header. When every source has answered and none failed, and no run is listed, the pane shall say "No runs yet" under the header in place of the table and its column names. If a read failed and no run is listed, the pane shall show only the header, as the list column says what failed. The column names shall show only while the rows show their cells side by side, and a screen reader shall hear each row's own sentence, not the column names.

## Examples

- Given a workspace's run that ended today after 2 minutes, started by a schedule, and a team's run from yesterday,
  when the Runs page shows no run open,
  then the pane says "All runs" over the column names, "Today" with the workspace's run and "took 2 min", then "Yesterday" with the team's run and an empty Started by.
- Given a failed run in the table,
  when the pane shows it,
  then its line is in the danger colour.
- Given a waiting run and a running run,
  when the pane shows them,
  then only the running run's chip has a dot.
- Given the sources haven't answered yet,
  when the Runs page shows no run open,
  then the pane shows the loading rows, not "No runs yet".
- Given no runs,
  when the Runs page shows no run open,
  then the pane says "All runs" and "No runs yet", with no column names.
- Given a workspace's run in the table,
  when the person clicks its row,
  then its page replaces the table and the focus is on the page's first button.
- Given a workspace's run in the table,
  when the person Ctrl-clicks its row,
  then its page opens in a new tab and the table stays.
