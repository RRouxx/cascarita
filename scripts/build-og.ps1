# ============================================================
# Cascarita - genera la imagen social (Open Graph, 1200x630) y el
# icono (180x180) con System.Drawing. Los textos con acento viven en
# og_text.json (UTF-8) para no chocar con el encoding de PS 5.1.
#   .\scripts\build-og.ps1
# ============================================================
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $raiz "assets"

$t = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot "og_text.json"))) | ConvertFrom-Json

$colBg    = [System.Drawing.Color]::FromArgb(13,16,19)
$colGreen = [System.Drawing.Color]::FromArgb(24,201,100)
$colWhite = [System.Drawing.Color]::White
$colGray  = [System.Drawing.Color]::FromArgb(150,163,176)
$colDark  = [System.Drawing.Color]::FromArgb(20,20,22)

function New-Font($size,$bold) {
  $style = if ($bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
  New-Object System.Drawing.Font("Segoe UI",[float]$size,$style,[System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-Ball($g,$cx,$cy,$r) {
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($colWhite)),[float]($cx-$r),[float]($cy-$r),[float](2*$r),[float](2*$r))
  $pts = New-Object System.Drawing.PointF[] 5
  for ($i=0; $i -lt 5; $i++) {
    $a = (-90 + 72*$i) * [Math]::PI/180
    $pts[$i] = New-Object System.Drawing.PointF([float]($cx + 0.42*$r*[Math]::Cos($a)), [float]($cy + 0.42*$r*[Math]::Sin($a)))
  }
  $g.FillPolygon((New-Object System.Drawing.SolidBrush($colDark)), $pts)
  $pen = New-Object System.Drawing.Pen($colDark, [float]($r*0.07)); $pen.StartCap='Round'; $pen.EndCap='Round'
  for ($i=0; $i -lt 5; $i++) {
    $a = (-90 + 72*$i) * [Math]::PI/180
    $x2 = $cx + 0.97*$r*[Math]::Cos($a); $y2 = $cy + 0.97*$r*[Math]::Sin($a)
    $g.DrawLine($pen, $pts[$i].X, $pts[$i].Y, [float]$x2, [float]$y2)
  }
  $g.DrawEllipse((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45,45,48),[float]($r*0.05))),[float]($cx-$r),[float]($cy-$r),[float](2*$r),[float](2*$r))
}

# ---------- OG 1200x630 ----------
$W=1200; $H=630
$bmp = New-Object System.Drawing.Bitmap($W,$H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.FillRectangle((New-Object System.Drawing.SolidBrush($colBg)),0,0,$W,$H)
# campo tenue a la derecha
$penF = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(22,255,255,255),3)
$g.DrawEllipse($penF, $W-300, $H/2-150, 300, 300)
$g.DrawLine($penF, $W-150, 0, $W-150, $H)
# barra verde izquierda
$g.FillRectangle((New-Object System.Drawing.SolidBrush($colGreen)),0,0,16,$H)
# balon
Draw-Ball $g 150 175 70
# textos
$g.DrawString($t.titulo, (New-Font 118 $true), (New-Object System.Drawing.SolidBrush($colWhite)), 258, 110)
$g.DrawString($t.sub,    (New-Font 46 $true),  (New-Object System.Drawing.SolidBrush($colGreen)), 262, 258)
$g.DrawString($t.juegos, (New-Font 30 $false), (New-Object System.Drawing.SolidBrush($colGray)), 60, 500)
$g.DrawString($t.url,    (New-Font 26 $true),  (New-Object System.Drawing.SolidBrush($colGray)), 60, 560)
$g.Dispose()
$bmp.Save((Join-Path $assets "og.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ---------- Icono 180x180 ----------
$S=180
$ic = New-Object System.Drawing.Bitmap($S,$S)
$g2 = [System.Drawing.Graphics]::FromImage($ic)
$g2.SmoothingMode = 'AntiAlias'
$g2.FillRectangle((New-Object System.Drawing.SolidBrush($colGreen)),0,0,$S,$S)
Draw-Ball $g2 90 90 62
$g2.Dispose()
$ic.Save((Join-Path $assets "icon-180.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$ic.Dispose()

# ---------- Icono 1024x1024 (para Facebook / stores) ----------
$S2 = 1024
$ic2 = New-Object System.Drawing.Bitmap($S2, $S2)
$g3 = [System.Drawing.Graphics]::FromImage($ic2)
$g3.SmoothingMode = 'AntiAlias'
$g3.FillRectangle((New-Object System.Drawing.SolidBrush($colGreen)), 0, 0, $S2, $S2)
Draw-Ball $g3 512 512 355
$g3.Dispose()
$ic2.Save((Join-Path $assets "icon-1024.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$ic2.Dispose()

Write-Host "LISTO -> assets\og.png (1200x630)  +  assets\icon-180.png  +  assets\icon-1024.png"
