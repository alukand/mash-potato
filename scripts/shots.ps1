# Convert raw iPhone screenshots into App Store Connect's exact pixel sizes.
#
# ASC refuses anything that is not an accepted size, to the pixel: the 6.5"
# slot takes 1242x2688 or 1284x2778 and nothing else. A 15/16/17 Pro Max
# produces 1290x2796 and a non-Max 15/16 Pro produces 1179x2556, so most
# modern phones need this step.
#
# Aspect ratios differ very slightly between source and target, so the image is
# scaled to FIT (never cropped, nothing important lost) and centred on a canvas
# painted #15121B, the app's own background. On a dark UI the few pixels of
# padding are invisible.
#
# The output is written as 24-bit RGB with NO alpha channel. Apple rejects
# screenshots carrying transparency, and a straight Save from a Bitmap that has
# an alpha channel keeps one.
#
# Usage:
#   powershell -File scripts\shots.ps1 -In "C:\path\to\raw" [-Out "...\ready"]
#
# Order the output by renaming: ASC uses filename order, and the first three
# are what show in search results.

param(
  [Parameter(Mandatory = $true)][string]$In,
  [string]$Out = "",
  [int]$Width = 1284,
  [int]$Height = 2778
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $In)) { Write-Error "Input folder not found: $In"; exit 1 }
if ($Out -eq "") { $Out = Join-Path $In "asc-ready" }
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out -Force | Out-Null }

$bg = [System.Drawing.Color]::FromArgb(255, 0x15, 0x12, 0x1B)
$files = Get-ChildItem -Path $In -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg|PNG|JPG|JPEG)$' } | Sort-Object Name

if ($files.Count -eq 0) { Write-Error "No images found in $In"; exit 1 }

Write-Output "Target: ${Width}x${Height}  (App Store Connect 6.5in slot)"
Write-Output ""

$i = 0
foreach ($f in $files) {
  $i++
  $src = [System.Drawing.Image]::FromFile($f.FullName)

  # scale to fit, preserving aspect - never crop
  $scale = [Math]::Min($Width / $src.Width, $Height / $src.Height)
  $w = [int][Math]::Round($src.Width * $scale)
  $h = [int][Math]::Round($src.Height * $scale)
  $x = [int](($Width - $w) / 2)
  $y = [int](($Height - $h) / 2)

  # Format24bppRgb: no alpha channel, which is what Apple requires
  $canvas = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear($bg)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, $x, $y, $w, $h)
  $g.Dispose()

  $name = "{0:D2}-{1}.png" -f $i, [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $dest = Join-Path $Out $name
  $canvas.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)

  $pad = if ($x -gt 0) { "${x}px side padding" } elseif ($y -gt 0) { "${y}px top/bottom padding" } else { "exact fit" }
  Write-Output ("  {0,-28} {1,4}x{2,-5} -> {3}x{4}  ({5})" -f $f.Name, $src.Width, $src.Height, $Width, $Height, $pad)

  $canvas.Dispose()
  $src.Dispose()
}

Write-Output ""
Write-Output "$i image(s) written to $Out"
Write-Output "Drag them into the iPhone 6.5in box in App Store Connect, in filename order."
