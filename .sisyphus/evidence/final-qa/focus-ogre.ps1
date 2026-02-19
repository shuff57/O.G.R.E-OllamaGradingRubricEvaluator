Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@

$p = Get-Process -Name 'ogre-desktop' -ErrorAction SilentlyContinue
if ($p) {
    [WinHelper]::ShowWindow($p.MainWindowHandle, 9)
    Start-Sleep -Milliseconds 200
    [WinHelper]::SetForegroundWindow($p.MainWindowHandle)
    Write-Output "Focused PID $($p.Id)"
} else {
    Write-Output "Not running"
}
