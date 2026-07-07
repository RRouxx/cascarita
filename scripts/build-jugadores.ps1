# ============================================================
# Cascarita — pipeline de datos: baja las plantillas de Liga MX
# desde la API pública de ESPN y arma data/jugadores.json.
# Reejecutar cada cierto tiempo para refrescar (altas/bajas).
#   .\scripts\build-jugadores.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$raiz    = Split-Path $PSScriptRoot -Parent
$salida  = Join-Path $raiz "data\jugadores.json"
$liga    = "mex.1"   # Liga MX en ESPN

# Temporada/tipo de ESPN con estadísticas completas (probado: 2025/1 tiene ~11 partidos
# de promedio y buena cobertura; 2026 aún no está poblada). Todos los jugadores se comparan
# sobre la MISMA campaña -> justo para "Mayor o menor".
$STATS_SEASON = 2025
$STATS_TYPE   = 1

# Denylist de equipos a excluir del dataset (curación).
# Vacío: los 18 que devuelve ESPN son correctos. Mazatlán FC desapareció y Atlante (ATL)
# ocupó su lugar en la Liga MX, así que Atlante SÍ va. (Mantener el mecanismo por si en
# el futuro hay ascensos/descensos que ensucien la lista.)
$excluidos = @()

function Map-Posicion($abbr) {
  switch ($abbr) {
    "G" { "POR" }; "D" { "DEF" }; "M" { "MED" }; "F" { "DEL" }
    default { "MED" }
  }
}

# PowerShell 5.1 decodifica la respuesta como Latin-1 y rompe los acentos.
# Leemos los bytes crudos y los decodificamos como UTF-8 a mano.
function Get-JsonUtf8($url) {
  $resp = Invoke-WebRequest -Uri $url -TimeoutSec 25 -UseBasicParsing
  $bytes = $resp.RawContentStream.ToArray()
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  return ($text | ConvertFrom-Json)
}

# Edad a partir de la fecha de nacimiento (por si el atleta no trae 'age').
function Edad-DesdeDOB($dob) {
  if (-not $dob) { return $null }
  try {
    $f = [datetime]::Parse($dob)
    $e = [int][math]::Floor(((Get-Date) - $f).TotalDays / 365.25)
    if ($e -gt 12 -and $e -lt 55) { return $e }
  } catch {}
  return $null
}

# Baja los atletas de un equipo. Primero el endpoint 'roster' (rápido, temporada actual);
# si viene vacío (le pasa a algunos clubes como Cruz Azul/Tigres en pretemporada), cae al
# 'core API' por temporada, que devuelve un enlace por atleta (hay que bajar cada uno).
function Get-Athletes($teamId) {
  try {
    $r = Get-JsonUtf8 "https://site.api.espn.com/apis/site/v2/sports/soccer/$liga/teams/$teamId/roster"
    if ($r.athletes -and $r.athletes.Count -gt 0 -and $r.athletes[0].id) { return $r.athletes }
  } catch {}
  foreach ($yr in @(2026, 2025, 2024)) {
    try {
      $lst = Get-JsonUtf8 "https://sports.core.api.espn.com/v2/sports/soccer/leagues/$liga/seasons/$yr/teams/$teamId/athletes?limit=100"
      if ($lst.count -gt 0 -and $lst.items) {
        $out = New-Object System.Collections.Generic.List[object]
        foreach ($it in $lst.items) {
          try { $out.Add((Get-JsonUtf8 $it.'$ref')) } catch {}
        }
        if ($out.Count -gt 0) { Write-Host "    (relleno vía core API, temporada $yr)"; return $out }
      }
    } catch {}
  }
  return @()
}

# Estadísticas de un jugador (goles y partidos) de la campaña fijada. Null si no hay datos.
function Get-Stats($athleteId) {
  try {
    $s = Get-JsonUtf8 "https://sports.core.api.espn.com/v2/sports/soccer/leagues/$liga/seasons/$STATS_SEASON/types/$STATS_TYPE/athletes/$athleteId/statistics"
    $apps = $null; $goles = $null
    foreach ($cat in $s.splits.categories) {
      foreach ($st in $cat.stats) {
        if ($st.name -eq "appearances") { $apps = [int]$st.value }
        elseif ($st.name -eq "totalGoals") { $goles = [int]$st.value }
      }
    }
    return @{ partidos = $apps; goles = $goles }
  } catch { return $null }
}

Write-Host "Bajando equipos de Liga MX..."
$teamsResp = Get-JsonUtf8 "https://site.api.espn.com/apis/site/v2/sports/soccer/$liga/teams"
$equipos = $teamsResp.sports[0].leagues[0].teams

$jugadores = New-Object System.Collections.Generic.List[object]
$vistos = @{}

foreach ($t in $equipos) {
  $team = $t.team
  if ($excluidos -contains $team.abbreviation) {
    Write-Host ("  {0} ({1}) -> EXCLUIDO (no es Liga MX actual)" -f $team.displayName, $team.abbreviation)
    continue
  }
  Write-Host ("  {0} ({1})..." -f $team.displayName, $team.abbreviation)
  $athletes = Get-Athletes $team.id
  if (-not $athletes -or $athletes.Count -eq 0) {
    Write-Host "    (sin roster en ninguna fuente, se salta)"; continue
  }
  foreach ($a in $athletes) {
    if (-not $a.id -or $vistos.ContainsKey($a.id)) { continue }
    $vistos[$a.id] = $true

    $edad = $null
    if ($a.age) { $edad = [int]$a.age } elseif ($a.dateOfBirth) { $edad = Edad-DesdeDOB $a.dateOfBirth }

    $dorsal = $null
    if ($a.jersey -and $a.jersey -ne "") { $dorsal = [int]$a.jersey }

    $st = Get-Stats $a.id
    $partidos = if ($st) { $st.partidos } else { $null }
    $goles    = if ($st) { $st.goles } else { $null }

    # nombre corto para el juego (nombre visible sin acentos-problema queda en UTF-8)
    $jugadores.Add([ordered]@{
      id       = "$($a.id)"
      nombre   = "$($a.displayName)"
      equipo   = "$($team.displayName)"
      abbr     = "$($team.abbreviation)"
      pos      = (Map-Posicion $a.position.abbreviation)
      nac      = "$($a.citizenship)"
      edad     = $edad
      dorsal   = $dorsal
      partidos = $partidos
      goles    = $goles
      titular  = [bool]$dorsal   # proxy de "jugador de primer equipo"
    })
  }
  Start-Sleep -Milliseconds 150
}

# Solo jugadores con edad conocida (para que el juego sea justo)
$conEdad = $jugadores | Where-Object { $_.edad -ne $null }
$numEquipos = ($conEdad | ForEach-Object { $_.equipo } | Sort-Object -Unique).Count

$paquete = [ordered]@{
  liga        = "Liga MX"
  fuente      = "ESPN (site + core API)"
  actualizado = (Get-Date -Format "yyyy-MM-dd")
  totalEquipos = $numEquipos
  totalJugadores = $conEdad.Count
  jugadores   = $conEdad
}

$json = $paquete | ConvertTo-Json -Depth 6
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($salida, $json, $utf8)

# Copia como .js (window.CASCARITA_DATA) para que las paginas corran en file://
# con doble clic, sin necesidad de servidor (fetch de JSON local lo bloquea CORS).
$salidaJs = Join-Path $raiz "data\jugadores.js"
[System.IO.File]::WriteAllText($salidaJs, "window.CASCARITA_DATA = $json;", $utf8)

$titulares = ($conEdad | Where-Object { $_.titular }).Count
$goleadores = ($conEdad | Where-Object { $_.goles -ne $null -and $_.goles -ge 1 }).Count
Write-Host ""
Write-Host "LISTO -> $salida"
Write-Host ("  Equipos: {0}  |  Con edad: {1}  |  Con dorsal: {2}  |  Goleadores (>=1 gol): {3}" -f $numEquipos, $conEdad.Count, $titulares, $goleadores)
