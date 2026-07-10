# ============================================================
# Cascarita — pipeline de TRAYECTORIAS: baja el historial de clubes
# (bio/teamHistory de ESPN) de los jugadores relevantes de Liga MX y
# las 5 grandes ligas, filtra selecciones/juveniles, descarga los
# escudos que falten y arma data/trayectorias.json/.js.
#   .\scripts\build-trayectorias.ps1
# Requiere data/jugadores.json y data/jugadores_global.json ya generados.
# Tarda ~8-12 min (una llamada por jugador, ~1,200).
# ============================================================

$ErrorActionPreference = "Stop"
$raiz   = Split-Path $PSScriptRoot -Parent
$dirEsc = Join-Path $raiz "assets\escudos"
New-Item -ItemType Directory -Force -Path $dirEsc | Out-Null

$MIN_CLUBES = 3     # una trayectoria interesante tiene al menos 3 paradas
$MIN_PJ_MX  = 12
$MIN_PJ_GL  = 15

function Get-JsonUtf8($url) {
  $resp = Invoke-WebRequest -Uri $url -TimeoutSec 25 -UseBasicParsing
  $bytes = $resp.RawContentStream.ToArray()
  return ([System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}
function Lee-Json($ruta) {
  $txt = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($ruta))
  return ($txt | ConvertFrom-Json)
}

$mx = (Lee-Json (Join-Path $raiz "data\jugadores.json")).jugadores | Where-Object { $_.partidos -ge $MIN_PJ_MX }
$gl = (Lee-Json (Join-Path $raiz "data\jugadores_global.json")).jugadores | Where-Object { $_.partidos -ge $MIN_PJ_GL }

# Nombres de selecciones a excluir del historial: todos los países que aparecen
# como nacionalidad en ambos datasets (ESPN nombra la selección igual que el país).
$paises = @{}
foreach ($j in $mx) { if ($j.nac) { $paises[$j.nac] = $true } }
foreach ($j in $gl) { if ($j.nac) { $paises[$j.nac] = $true } }

function Es-Seleccion($nombre) {
  if ($paises.ContainsKey($nombre)) { return $true }
  if ($nombre -match "U\d\d|Under-|Olympic") { return $true }
  return $false
}

# Años de inicio para ordenar ("2018-2020" | "2022-CURRENT" | "2020")
function Anio-Inicio($seasons) {
  if (-not $seasons) { return $null }
  $m = [regex]::Match("$seasons", "^\d{4}")
  if ($m.Success) { return [int]$m.Value } else { return $null }
}

$jugadores = New-Object System.Collections.Generic.List[object]
$logosPedidos = @{}   # club id -> $true si ya existe o ya se descargó
$logosFallidos = @{}
Get-ChildItem $dirEsc -Filter *.png | ForEach-Object { $logosPedidos[$_.BaseName] = $true }
$nuevosLogos = 0

function Asegura-Logo($clubId) {
  if ($logosPedidos.ContainsKey("$clubId")) { return $true }
  if ($logosFallidos.ContainsKey("$clubId")) { return $false }
  $destino = Join-Path $dirEsc "$clubId.png"
  try {
    Invoke-WebRequest -Uri "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/$clubId.png&w=180&h=180" -OutFile $destino -TimeoutSec 20 -UseBasicParsing
    if ((Get-Item $destino).Length -lt 500) { throw "muy chico" }  # 404 disfrazado
    $logosPedidos["$clubId"] = $true
    $script:nuevosLogos++
    return $true
  } catch {
    Remove-Item $destino -ErrorAction SilentlyContinue
    $logosFallidos["$clubId"] = $true
    return $false
  }
}

$total = $mx.Count + $gl.Count
$hecho = 0
foreach ($grupo in @(@{ lista = $mx; origen = "mx" }, @{ lista = $gl; origen = "global" })) {
  foreach ($j in $grupo.lista) {
    $hecho++
    if ($hecho % 100 -eq 0) { Write-Host ("  {0}/{1}... (con trayectoria: {2})" -f $hecho, $total, $jugadores.Count) }
    $th = $null
    try {
      $bio = Get-JsonUtf8 "https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/$($j.id)/bio"
      $th = $bio.teamHistory
    } catch { continue }
    if (-not $th) { continue }

    $clubs = New-Object System.Collections.Generic.List[object]
    foreach ($t in $th) {
      if (-not $t.id -or -not $t.displayName) { continue }
      if (Es-Seleccion $t.displayName) { continue }
      $inicio = Anio-Inicio $t.seasons
      if ($inicio -eq $null) { continue }
      if (-not (Asegura-Logo $t.id)) { continue }
      $clubs.Add(@{ id = "$($t.id)"; n = "$($t.displayName)"; y = ("$($t.seasons)" -replace "CURRENT", "hoy"); ini = $inicio })
    }
    if ($clubs.Count -lt $MIN_CLUBES) { continue }

    # scriptblock: Sort-Object con nombre de propiedad no lee claves de hashtable en PS 5.1
    $ordenados = $clubs | Sort-Object { $_.ini }
    $jugadores.Add([ordered]@{
      id     = "$($j.id)"
      nombre = "$($j.nombre)"
      pos    = "$($j.pos)"
      nac    = "$($j.nac)"
      origen = $grupo.origen
      clubs  = @($ordenados | ForEach-Object { [ordered]@{ id = $_.id; n = $_.n; y = $_.y } })
    })
    Start-Sleep -Milliseconds 40
  }
}

$paquete = [ordered]@{
  fuente      = "ESPN (bio/teamHistory + teamlogos)"
  actualizado = (Get-Date -Format "yyyy-MM-dd")
  totalJugadores = $jugadores.Count
  jugadores   = $jugadores
}
$json = $paquete | ConvertTo-Json -Depth 6 -Compress
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $raiz "data\trayectorias.json"), $json, $utf8)
[System.IO.File]::WriteAllText((Join-Path $raiz "data\trayectorias.js"), "window.CASCARITA_TRAYECTORIAS = $json;", $utf8)

$cmx = ($jugadores | Where-Object { $_.origen -eq "mx" }).Count
Write-Host ""
Write-Host "LISTO -> data\trayectorias.json/.js"
Write-Host ("  Con trayectoria (>= {0} clubes): {1}  (mx: {2} | global: {3})  |  escudos nuevos: {4}  |  logos fallidos: {5}" -f $MIN_CLUBES, $jugadores.Count, $cmx, ($jugadores.Count - $cmx), $nuevosLogos, $logosFallidos.Count)
