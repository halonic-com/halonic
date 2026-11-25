# The runner takes only .ps1 and .sh hooks, so this one runs the admission check in
# job-started.mjs with the image's own Node. The job's env: reaches this hook, so nothing here may
# depend on it: every NODE_* variable goes first (NODE_OPTIONS=--import=... would run a fork's code
# before the check), and Node has a fixed path, not one from $env:ProgramFiles or PATH. .NET calls
# rather than cmdlets, so no module loads from a PSModulePath the job set. The runner fails the job
# when this exits non-zero.
foreach ($name in @([Environment]::GetEnvironmentVariables().Keys)) {
  if ($name -like 'NODE_*') { [Environment]::SetEnvironmentVariable($name, $null) }
}
& 'C:\Program Files\nodejs\node.exe' "$PSScriptRoot\job-started.mjs" # leak-guard: allow absolute-path where setup-2.ps1 installs Node in the image
exit $LASTEXITCODE
