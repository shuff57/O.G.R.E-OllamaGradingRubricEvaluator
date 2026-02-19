param([string]$Name = "screenshot")
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(1280, 800)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen(0, 0, 0, 0, (New-Object System.Drawing.Size(1280, 800)))
$outPath = "$PSScriptRoot\$Name.png"
$bmp.Save($outPath)
$graphics.Dispose()
$bmp.Dispose()
Write-Output "Saved: $outPath"
