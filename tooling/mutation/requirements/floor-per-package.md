# mutation.floor-per-package

- Status: active
- Since: 0.1.0
- Source: HAL-3082

When a package has a mutation floor and its score in the nightly run is under that floor, or it has no mutants to score, the mutation runner shall fail the run and mark the row in the job summary. Packages without a floor only report.

## Examples

- Given a floor of 85% and a score of 84%,
  when the runner checks the floor,
  then the package is under it.
- Given a floor of 85% and a score of 85%,
  when the runner checks the floor,
  then the package is not under it.
- Given a package without a floor and a score of 0%,
  when the runner checks the floor,
  then the run does not fail.
