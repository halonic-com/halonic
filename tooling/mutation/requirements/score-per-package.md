# mutation.score-per-package

- Status: active
- Since: 0.1.0
- Source: HAL-109

When the nightly mutation run has finished, the mutation runner shall report one row per target package with its mutation score, counted the way Stryker counts it: killed and timed-out mutants are detected, survived and uncovered mutants are not, and mutants that failed to compile or crashed are left out.

## Examples

- Given a report with 3 killed, 1 timed-out, 1 survived and 1 uncovered mutant,
  when the runner scores it,
  then the score is 66.7% with 4 detected, 2 survived and 1 without coverage.
- Given a report whose only mutants failed to compile,
  when the runner scores it,
  then the row says "no mutants" and counts 1 error.
- Given a nightly run where yaml scored 80% and workflow had no code,
  when the runner writes the job summary,
  then the table has a row "yaml | 80.0%" and a row "workflow | no code yet".
