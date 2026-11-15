/**
 * The PowerShell that reads a Credential Manager secret for A36 and writes it
 * to stdout. Run inside a box, so it uses no cmdlet and no `Add-Type`.
 */
export function credentialReadScript(target: string): string {
  // The two calls are built in memory with reflection, not compiled with
  // `Add-Type`: that starts the C# compiler, which the box may stop. Each
  // step writes a marker to stderr, so a stuck run shows where it stopped.
  // No cmdlet is used either: the first one (`New-Object`) hung before it
  // returned, probably loading its module inside the box.
  return `
  function Step($name) { [Console]::Error.WriteLine("step: " + $name) }
  Step "start"
  $name = [System.Reflection.AssemblyName]::new("HalonicVault")
  Step "assembly name"
  $assembly = [System.AppDomain]::CurrentDomain.DefineDynamicAssembly($name, [System.Reflection.Emit.AssemblyBuilderAccess]::Run)
  Step "assembly"
  $type = $assembly.DefineDynamicModule("HalonicVault").DefineType("Vault", "Public,Class")
  Step "type"
  $flags = [System.Reflection.MethodAttributes]"Public,Static,PinvokeImpl"
  $read = $type.DefinePInvokeMethod("CredRead", "advapi32.dll", $flags, [System.Reflection.CallingConventions]::Standard, [bool], [type[]]@([string], [int], [int], [System.IntPtr].MakeByRefType()), [System.Runtime.InteropServices.CallingConvention]::Winapi, [System.Runtime.InteropServices.CharSet]::Unicode)
  Step "CredRead declared"
  $read.SetImplementationFlags($read.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)
  $free = $type.DefinePInvokeMethod("CredFree", "advapi32.dll", $flags, [System.Reflection.CallingConventions]::Standard, [void], [type[]]@([System.IntPtr]), [System.Runtime.InteropServices.CallingConvention]::Winapi, [System.Runtime.InteropServices.CharSet]::Unicode)
  $free.SetImplementationFlags($free.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)
  $last = $type.DefinePInvokeMethod("GetLastError", "kernel32.dll", $flags, [System.Reflection.CallingConventions]::Standard, [int], [type[]]@(), [System.Runtime.InteropServices.CallingConvention]::Winapi, [System.Runtime.InteropServices.CharSet]::Unicode)
  $last.SetImplementationFlags($last.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)
  Step "CredFree declared"
  $vault = $type.CreateType()
  Step "built"
  $arguments = [object[]]@('${target.replaceAll("'", "''")}', 1, 0, [System.IntPtr]::Zero)
  $found = $vault.GetMethod("CredRead").Invoke($null, $arguments)
  Step ("CredRead returned " + $found)
  if (-not $found) {
    # Why it failed: 5 is access denied, 1168 is no such entry.
    Step ("last error " + $vault.GetMethod("GetLastError").Invoke($null, @()))
    exit 1
  }
  $pointer = $arguments[3]
  # CREDENTIALW: CredentialBlobSize follows Flags, Type, two strings and
  # LastWritten (16 bytes + 2 pointers); CredentialBlob follows it, padded
  # to a pointer. That is 32 and 40 on 64-bit Windows.
  $size = [System.Runtime.InteropServices.Marshal]::ReadInt32($pointer, 16 + 2 * [System.IntPtr]::Size)
  $blob = [System.Runtime.InteropServices.Marshal]::ReadIntPtr($pointer, 16 + 3 * [System.IntPtr]::Size)
  [Console]::Out.Write([System.Runtime.InteropServices.Marshal]::PtrToStringUni($blob, $size / 2))
  [void]$vault.GetMethod("CredFree").Invoke($null, @($pointer))
  `;
}
