@echo off
rem Halonic MXC diagnosis inside Windows Sandbox (HAL-3503). Started by mxc-sandbox.wsb at logon; not for the real profile.
rem The report goes to the mapped output folder next to this script folder, so it survives closing the sandbox.
set "MXC_OUT=%~dp0..\out"
set "MXC_ACE_REPRO=1"
call "%~dp0mxc-diag.cmd"
