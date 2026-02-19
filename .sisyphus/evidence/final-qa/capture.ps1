Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap(1280, 800)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size(1280, 800)))
$bmp.Save("$PSScriptRoot\test-capture.png")
$graphics.Dispose()
$bmp.Dispose()
Write-Output "Screenshot saved"
