# ============================================================
# Cascarita — pipeline GLOBAL: baja las plantillas de las 5 grandes
# ligas europeas desde la API pública de ESPN (con goles/partidos de
# la campaña 2025-26) y arma data/jugadores_global.json/.js.
# También captura los COLORES de cada club (para los avatares del draft).
#   .\scripts\build-jugadores-global.ps1
# Tarda ~10-20 min (una llamada de stats por jugador, ~2,900).
# ============================================================

$ErrorActionPreference = "Stop"
$raiz   = Split-Path $PSScriptRoot -Parent
$salida = Join-Path $raiz "data\jugadores_global.json"

# Temporada europea 2025-26 (ESPN la llama 2025); tipo 1 = liga regular.
$STATS_SEASON = 2025
$STATS_TYPE   = 1

$LIGAS = @(
  @{ slug = "eng.1"; nombre = "Premier League" },
  @{ slug = "esp.1"; nombre = "LaLiga" },
  @{ slug = "ita.1"; nombre = "Serie A" },
  @{ slug = "ger.1"; nombre = "Bundesliga" },
  @{ slug = "fra.1"; nombre = "Ligue 1" }
)

function Map-Posicion($abbr) {
  switch ($abbr) {
    "G" { "POR" }; "D" { "DEF" }; "M" { "MED" }; "F" { "DEL" }
    default { "MED" }
  }
}

# PS 5.1 decodifica como Latin-1 y rompe acentos: bytes crudos -> UTF-8 a mano.
function Get-JsonUtf8($url) {
  $resp = Invoke-WebRequest -Uri $url -TimeoutSec 25 -UseBasicParsing
  $bytes = $resp.RawContentStream.ToArray()
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  return ($text | ConvertFrom-Json)
}

function Edad-DesdeDOB($dob) {
  if (-not $dob) { return $null }
  try {
    $f = [datetime]::Parse($dob)
    $e = [int][math]::Floor(((Get-Date) - $f).TotalDays / 365.25)
    if ($e -gt 12 -and $e -lt 55) { return $e }
  } catch {}
  return $null
}

# Roster con fallback: si el endpoint normal viene vacío (Real Madrid, Barcelona,
# varios en pretemporada), cae al core API por temporada (un enlace por atleta).
function Get-Athletes($ligaSlug, $teamId) {
  try {
    $r = Get-JsonUtf8 "https://site.api.espn.com/apis/site/v2/sports/soccer/$ligaSlug/teams/$teamId/roster"
    if ($r.athletes -and $r.athletes.Count -gt 0 -and $r.athletes[0].id) { return $r.athletes }
  } catch {}
  foreach ($yr in @(2026, 2025)) {
    try {
      $lst = Get-JsonUtf8 "https://sports.core.api.espn.com/v2/sports/soccer/leagues/$ligaSlug/seasons/$yr/teams/$teamId/athletes?limit=100"
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

function Get-Stats($ligaSlug, $athleteId) {
  try {
    $s = Get-JsonUtf8 "https://sports.core.api.espn.com/v2/sports/soccer/leagues/$ligaSlug/seasons/$STATS_SEASON/types/$STATS_TYPE/athletes/$athleteId/statistics"
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

$jugadores = New-Object System.Collections.Generic.List[object]
$coloresEquipos = [ordered]@{}
$vistos = @{}

foreach ($l in $LIGAS) {
  Write-Host ""
  Write-Host ("=== {0} ({1}) ===" -f $l.nombre, $l.slug)
  $teamsResp = Get-JsonUtf8 "https://site.api.espn.com/apis/site/v2/sports/soccer/$($l.slug)/teams"
  $equipos = $teamsResp.sports[0].leagues[0].teams

  foreach ($t in $equipos) {
    $team = $t.team
    Write-Host ("  {0} ({1})..." -f $team.displayName, $team.abbreviation)

    # colores del club para los avatares (hex sin #)
    $c1 = if ($team.color) { "#$($team.color)" } else { "#39424d" }
    $c2 = if ($team.alternateColor) { "#$($team.alternateColor)" } else { "#ffffff" }
    $coloresEquipos[$team.displayName] = @($c1, $c2)

    $athletes = Get-Athletes $l.slug $team.id
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

      $st = Get-Stats $l.slug $a.id
      $partidos = if ($st) { $st.partidos } else { $null }
      $goles    = if ($st) { $st.goles } else { $null }

      # recorte de tamaño: solo jugadores con presencia (edad + dorsal o minutos)
      if ($edad -eq $null) { continue }
      if (-not $dorsal -and -not $partidos) { continue }

      $jugadores.Add([ordered]@{
        id       = "$($a.id)"
        nombre   = "$($a.displayName)"
        equipo   = "$($team.displayName)"
        abbr     = "$($team.abbreviation)"
        liga     = $l.nombre
        pos      = (Map-Posicion $a.position.abbreviation)
        nac      = "$($a.citizenship)"
        edad     = $edad
        dorsal   = $dorsal
        partidos = $partidos
        goles    = $goles
        titular  = [bool]$dorsal
      })
    }
    Start-Sleep -Milliseconds 100
  }
}

$numEquipos = ($jugadores | ForEach-Object { $_.equipo } | Sort-Object -Unique).Count
$paquete = [ordered]@{
  fuente      = "ESPN (site + core API)"
  temporada   = "2025-26"
  actualizado = (Get-Date -Format "yyyy-MM-dd")
  totalEquipos = $numEquipos
  totalJugadores = $jugadores.Count
  equipos     = $coloresEquipos
  jugadores   = $jugadores
}

# -Compress: son ~2,000+ jugadores, el JSON indentado pesaría el triple
$json = $paquete | ConvertTo-Json -Depth 6 -Compress
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($salida, $json, $utf8)
[System.IO.File]::WriteAllText((Join-Path $raiz "data\jugadores_global.js"), "window.CASCARITA_DATA_GLOBAL = $json;", $utf8)

$conStats = ($jugadores | Where-Object { $_.partidos -ge 1 }).Count
Write-Host ""
Write-Host "LISTO -> $salida"
Write-Host ("  Equipos: {0}  |  Jugadores: {1}  |  Con partidos: {2}" -f $numEquipos, $jugadores.Count, $conStats)
