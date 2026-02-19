Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FocusWin {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$proc = Get-Process -Name 'ogre-desktop' -ErrorAction SilentlyContinue
if ($proc) {
    $handle = $proc.MainWindowHandle
    Write-Output "Handle: $handle"
    [FocusWin]::ShowWindow($handle, 9)
    Start-Sleep -Milliseconds 300
    [FocusWin]::SetForegroundWindow($handle)
    Write-Output "Done"
} else {
    Write-Output "Not found"
}
