# The runner takes only .ps1 and .sh hooks, so this one runs the admission check in
# job-started.mjs with the image's own Node (full path: a job can't put another node.exe first on
# PATH before it starts). The runner fails the job when this exits non-zero.
& "$env:ProgramFiles\nodejs\node.exe" (Join-Path $PSScriptRoot 'job-started.mjs')
exit $LASTEXITCODE
