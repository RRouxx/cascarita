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
$colYellow= [System.Drawing.Color]::FromArgb(234,179,8)
$colTile  = [System.Drawing.Color]::FromArgb(58,58,62)

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
$fmt = [System.Drawing.StringFormat]::GenericTypographic

# motivo de cancha tenue (derecha)
$penF = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(20,255,255,255),3)
$g.DrawEllipse($penF, $W-260, $H/2-140, 280, 280)
$g.DrawLine($penF, $W-120, 0, $W-120, $H)
$g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30,255,255,255))), $W-260+140-7, $H/2-7, 14, 14)

# barra verde izquierda
$g.FillRectangle((New-Object System.Drawing.SolidBrush($colGreen)),0,0,14,$H)

# balon + wordmark
Draw-Ball $g 150 148 66
$g.DrawString($t.titulo, (New-Font 96 $true), (New-Object System.Drawing.SolidBrush($colWhite)), 244, 96, $fmt)

# titular con "Wordle" en verde (segmentos para colorear una palabra)
$fH = New-Font 52 $true
$hx = 60.0; $hy = 250.0
$spaceW = ($g.MeasureString("A A", $fH, [int]::MaxValue, $fmt)).Width - ($g.MeasureString("AA", $fH, [int]::MaxValue, $fmt)).Width
$seg = @( @($t.hookPre,$colWhite), @($t.hookAccent,$colGreen), @($t.hookPost,$colWhite) )
foreach ($s in $seg) {
  $g.DrawString($s[0], $fH, (New-Object System.Drawing.SolidBrush($s[1])), [float]$hx, [float]$hy, $fmt)
  $hx += ($g.MeasureString($s[0], $fH, [int]::MaxValue, $fmt)).Width + $spaceW
}

# fichas estilo Wordle (verde / amarillo / apagado)
$tileY = 332; $tileX = 60; $tileS = 60; $tileGap = 12
$tileCols = @($colGreen, $colYellow, $colTile, $colGreen, $colYellow)
for ($i=0; $i -lt 5; $i++) {
  $bx = $tileX + $i*($tileS+$tileGap)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($tileCols[$i])), [float]$bx, [float]$tileY, [float]$tileS, [float]$tileS)
}

# sub + juegos + url
$g.DrawString($t.sub,    (New-Font 33 $false), (New-Object System.Drawing.SolidBrush($colWhite)), 60, 430, $fmt)
$g.DrawString($t.juegos, (New-Font 26 $false), (New-Object System.Drawing.SolidBrush($colGray)),  60, 484, $fmt)
$g.DrawString($t.url,    (New-Font 30 $true),  (New-Object System.Drawing.SolidBrush($colGreen)), 60, 552, $fmt)
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
