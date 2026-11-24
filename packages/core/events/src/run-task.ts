/**
 * The task a run worked on, as the caller that started it named it
 * (requirement `events.run-started-task`), so its tokens can be added up per
 * task and per pull request. There is no task model yet: `id` is just the
 * caller's string, such as `HAL-42`, and Halonic doesn't look it up.
 */
export interface RunTask {
  id: string;
  /**
   * The git branch the run worked on, which stands for its pull request:
   * a pull request is found by its branch. Absent when the caller didn't say.
   */
  branch?: string;
}
