# ============================================================
# Cascarita — pipeline de banderas: descarga PNGs (dominio público,
# flagcdn.com) y arma data/paises.js a partir de scripts/paises_src.json.
#   .\scripts\build-banderas.ps1
# Los nombres de países viven en paises_src.json (UTF-8) y se leen con
# decodificación UTF-8 explícita: PowerShell 5.1 lee los .ps1 sin BOM como
# Windows-1252 y corrompería los acentos si estuvieran en el código.
# En Windows los emoji de bandera no se renderizan, por eso el juego usa PNGs.
# ============================================================

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$dir  = Join-Path $raiz "assets\flags"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Get-ChildItem $dir -Filter *.svg -ErrorAction SilentlyContinue | Remove-Item -Force

# Lista de países (UTF-8) leída como bytes -> UTF-8 (a prueba del bug de encoding de PS 5.1)
$srcPath = Join-Path $PSScriptRoot "paises_src.json"
$srcTxt  = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($srcPath))
$lista   = $srcTxt | ConvertFrom-Json

$ok = 0; $fail = 0
foreach ($p in $lista) {
  $destino = Join-Path $dir "$($p.iso).png"
  if ((Test-Path $destino) -and (Get-Item $destino).Length -gt 0) { $ok++; continue }
  try {
    Invoke-WebRequest -Uri "https://flagcdn.com/w320/$($p.iso).png" -OutFile $destino -TimeoutSec 20 -UseBasicParsing
    $ok++
  } catch {
    Write-Host "  fallo $($p.iso) : $($_.Exception.Message)"; $fail++
  }
  Start-Sleep -Milliseconds 60
}

# data/paises.js = el mismo JSON (ya en UTF-8 correcto) envuelto para el navegador
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $raiz "data\paises.js"), "window.CASCARITA_PAISES = $srcTxt;", $utf8)

$peso = [math]::Round(((Get-ChildItem $dir -Filter *.png | Measure-Object Length -Sum).Sum / 1MB), 2)
Write-Host ""
Write-Host "LISTO -> assets\flags\*.png  +  data\paises.js"
Write-Host ("  Paises: {0}  |  descargadas OK: {1}  |  fallos: {2}  |  peso total: {3} MB" -f $lista.Count, $ok, $fail, $peso)
