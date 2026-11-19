# Runs a command line without elevation (HAL-5398). The runner's user is an
# administrator with UAC off, so everything else in the job runs elevated.
# This runs the command under the same user with a Safer "normal user"
# token (Administrators deny-only, no admin privileges) at medium
# integrity: what a program started without elevation gets. It waits for
# the command and exits with its exit code.
param([string]$CommandLine, [string]$Directory)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Basic {
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SaferCreateLevel(uint scope, uint level, uint flags, out IntPtr h, IntPtr reserved);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SaferComputeTokenFromLevel(IntPtr level, IntPtr inToken, out IntPtr outToken, uint flags, IntPtr reserved);
  [DllImport("advapi32.dll")] static extern bool SaferCloseLevel(IntPtr h);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool ConvertStringSidToSid(string sid, out IntPtr psid);
  [DllImport("advapi32.dll")] static extern int GetLengthSid(IntPtr sid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetTokenInformation(IntPtr t, int cls, ref TOKEN_MANDATORY_LABEL tml, int len);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr t, string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessWithTokenW(IntPtr t, uint logon, string app, string cmd, uint flags, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string lpReserved, lpDesktop, lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  static Exception Fail(string what) { return new Exception(what + " failed: " + Marshal.GetLastWin32Error()); }
  public static uint Run(string cmd, string dir) {
    IntPtr level, token, sid;
    // SAFER_SCOPEID_USER, SAFER_LEVELID_NORMALUSER, SAFER_LEVEL_OPEN
    if (!SaferCreateLevel(2, 0x20000, 1, out level, IntPtr.Zero)) throw Fail("SaferCreateLevel");
    if (!SaferComputeTokenFromLevel(level, IntPtr.Zero, out token, 0, IntPtr.Zero)) throw Fail("SaferComputeTokenFromLevel");
    SaferCloseLevel(level);
    // Medium integrity (S-1-16-8192), SE_GROUP_INTEGRITY; TokenIntegrityLevel is 25.
    if (!ConvertStringSidToSid("S-1-16-8192", out sid)) throw Fail("ConvertStringSidToSid");
    var tml = new TOKEN_MANDATORY_LABEL(); tml.Label.Sid = sid; tml.Label.Attributes = 0x20;
    if (!SetTokenInformation(token, 25, ref tml, Marshal.SizeOf(tml) + GetLengthSid(sid))) throw Fail("SetTokenInformation");
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(si);
    PROCESS_INFORMATION pi;
    // CREATE_NO_WINDOW. A restricted copy of our own token needs no
    // assign-token privilege; if it is refused anyway, go through seclogon.
    if (!CreateProcessAsUser(token, null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0x08000000, IntPtr.Zero, dir, ref si, out pi)) {
      Console.Error.WriteLine("CreateProcessAsUser failed: " + Marshal.GetLastWin32Error() + "; trying CreateProcessWithTokenW");
      if (!CreateProcessWithTokenW(token, 0, null, cmd, 0x08000000, IntPtr.Zero, dir, ref si, out pi)) throw Fail("CreateProcessWithTokenW");
    }
    WaitForSingleObject(pi.hProcess, 600000);
    uint code; GetExitCodeProcess(pi.hProcess, out code);
    return code;
  }
}
"@
exit ([Basic]::Run($CommandLine, $Directory))
