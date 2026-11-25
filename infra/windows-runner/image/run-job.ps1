# Runs one GitHub Actions job in the VM, started over SSH by the host's win-runner-cycle.sh. The
# just-in-time runner config comes on stdin, so it's on no command line, and goes to the runner in
# ACTIONS_RUNNER_INPUT_JITCONFIG, which the runner reads and clears before it starts a job. The
# admission hook (job-started.ps1) runs before the job's first step.
$ErrorActionPreference = 'Stop'
$config = [Console]::In.ReadToEnd().Trim()
if ($config -notmatch '^[A-Za-z0-9+/=]+$') { throw 'no just-in-time runner config on stdin' }
$env:ACTIONS_RUNNER_INPUT_JITCONFIG = $config
Remove-Variable config
$env:ACTIONS_RUNNER_HOOK_JOB_STARTED = Join-Path $env:SystemDrive 'halonic-win\job-started.ps1'
& (Join-Path $env:SystemDrive 'actions-runner\run.cmd')
exit $LASTEXITCODE
