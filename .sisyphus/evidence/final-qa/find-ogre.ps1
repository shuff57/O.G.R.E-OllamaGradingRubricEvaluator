Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Focus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int count);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

$targetPid = (Get-Process -Name 'ogre-desktop' -ErrorAction SilentlyContinue).Id
if (-not $targetPid) { Write-Output "OGRE not running"; exit 1 }

Write-Output "Looking for windows of PID $targetPid..."

[Win32Focus]::EnumWindows({
    param($hWnd, $lParam)
    $len = [Win32Focus]::GetWindowTextLength($hWnd)
    $pid = [uint32]0
    [Win32Focus]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
    
    if ($pid -eq $targetPid) {
        $title = ""
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder($len + 1)
            [Win32Focus]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
            $title = $sb.ToString()
        }
        $visible = [Win32Focus]::IsWindowVisible($hWnd)
        Write-Output "  Found: '$title' handle=$hWnd visible=$visible"
        
        if ($title -match "O\.G\.R\.E|Grading") {
            Write-Output "  -> Focusing this window!"
            [Win32Focus]::ShowWindow($hWnd, 9) | Out-Null
            Start-Sleep -Milliseconds 200
            [Win32Focus]::SetForegroundWindow($hWnd) | Out-Null
        }
    }
    return $true
}, [IntPtr]::Zero)
