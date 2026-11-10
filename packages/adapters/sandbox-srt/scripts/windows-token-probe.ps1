# Token probe of the Windows verdict probes (HAL-3776). It switches the
# thread's token, then opens a socket to the canary port and reads the denied
# file, and prints one JSON line. Modes: self (ImpersonateSelf), steal (a token
# of another user taken from a running process), deny-user (restricted token,
# user SID deny-only), deny-all (user and every group SID deny-only).
param([string]$Mode, [int]$Port, [string]$File)
Add-Type -TypeDefinition @"
using System; using System.IO; using System.Net; using System.Net.Sockets; using System.Diagnostics;
using System.Runtime.InteropServices; using System.Security.Principal; using System.Collections.Generic;
public static class Tok {
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateSelf(int level);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr t);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool DuplicateTokenEx(IntPtr t, uint access, IntPtr attrs, int level, int type, out IntPtr dup);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetThreadToken(IntPtr thread, IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr t, uint flags, uint nDisable, IntPtr[] disable, uint nDelete, IntPtr del, uint nRestrict, IntPtr restrict, out IntPtr r);
  [DllImport("advapi32.dll")] static extern bool RevertToSelf();
  static IntPtr Imp(IntPtr t) { IntPtr d; if (!DuplicateTokenEx(t, 0x02000000, IntPtr.Zero, 2, 2, out d)) return IntPtr.Zero; return d; }
  static string No(string why) { return "{\"switch\":\"no:" + why + "\"}"; }
  // The socket is opened and connected on this thread, so it carries the switched token.
  static string Probe(int port, string file) {
    string net, fs;
    try { using (var s = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp)) { s.Connect(new IPEndPoint(IPAddress.Loopback, port)); net = "reached"; } }
    catch (Exception e) { net = "blocked:" + e.GetType().Name; }
    try { fs = File.ReadAllText(file) == "hunter2" ? "read" : "other"; } catch (Exception e) { fs = "blocked:" + e.GetType().Name; }
    return "\"net\":\"" + net + "\",\"file\":\"" + fs + "\"";
  }
  public static string Go(string mode, int port, string file) {
    string me = WindowsIdentity.GetCurrent().Name, how = "";
    if (mode == "self") {
      if (!ImpersonateSelf(2)) return No(Marshal.GetLastWin32Error().ToString());
      how = "ImpersonateSelf";
    } else if (mode == "steal") {
      foreach (var p in Process.GetProcesses()) {
        IntPtr h = OpenProcess(0x1000, false, p.Id), t, d; if (h == IntPtr.Zero) continue;
        if (!OpenProcessToken(h, 0xA, out t)) continue;
        string user; try { user = new WindowsIdentity(t).Name; } catch { continue; }
        if (user == me || (d = Imp(t)) == IntPtr.Zero || !SetThreadToken(IntPtr.Zero, d)) continue;
        how = user + " from " + p.ProcessName; break;
      }
      if (how == "") return No("other-token");
    } else {
      IntPtr t, r; OpenProcessToken(GetCurrentProcess(), 0x2 | 0x8 | 0x1, out t);
      var id = WindowsIdentity.GetCurrent(); var sids = new List<SecurityIdentifier> { id.User };
      foreach (var g in id.Groups) sids.Add((SecurityIdentifier)g);
      // SID_AND_ATTRIBUTES pairs: a SID pointer, then attributes 0.
      var arr = new IntPtr[sids.Count * 2];
      for (int i = 0; i < sids.Count; i++) { var b = new byte[sids[i].BinaryLength]; sids[i].GetBinaryForm(b, 0); arr[i * 2] = Marshal.AllocHGlobal(b.Length); Marshal.Copy(b, 0, arr[i * 2], b.Length); }
      int n = mode == "deny-user" ? 1 : sids.Count;
      if (!CreateRestrictedToken(t, 0x1, (uint)n, arr, 0, IntPtr.Zero, 0, IntPtr.Zero, out r)) return No(Marshal.GetLastWin32Error().ToString());
      IntPtr d = Imp(r); if (d == IntPtr.Zero || !SetThreadToken(IntPtr.Zero, d)) return No(Marshal.GetLastWin32Error().ToString());
      how = n + " deny-only SID(s)";
    }
    string res = Probe(port, file); RevertToSelf();
    return "{\"switch\":\"" + how.Replace("\\", "/") + "\"," + res + "}";
  }
}
"@
Write-Output ([Tok]::Go($Mode, $Port, $File))
