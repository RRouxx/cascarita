# ============================================================
# Cascarita — pipeline de escudos: baja los equipos de 11 ligas
# desde la API pública de ESPN, descarga sus escudos (PNG 180px)
# y arma data/clubes.js + data/clubes.json.
#   .\scripts\build-escudos.ps1
# Los nombres traen acentos (América, Atlético, São Paulo): todo
# se lee y escribe en UTF-8 explícito por el bug de encoding de PS 5.1.
# ============================================================

$ErrorActionPreference = "Stop"
$raiz = Split-Path $PSScriptRoot -Parent
$dir  = Join-Path $raiz "assets\escudos"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Ligas: slug de ESPN -> nombre en español + país
$LIGAS = @(
  @{ slug = "mex.1"; liga = "Liga MX";          pais = "México" },
  @{ slug = "eng.1"; liga = "Premier League";   pais = "Inglaterra" },
  @{ slug = "esp.1"; liga = "LaLiga";           pais = "España" },
  @{ slug = "ita.1"; liga = "Serie A";          pais = "Italia" },
  @{ slug = "ger.1"; liga = "Bundesliga";       pais = "Alemania" },
  @{ slug = "fra.1"; liga = "Ligue 1";          pais = "Francia" },
  @{ slug = "por.1"; liga = "Liga de Portugal"; pais = "Portugal" },
  @{ slug = "ned.1"; liga = "Eredivisie";       pais = "Países Bajos" },
  @{ slug = "arg.1"; liga = "Liga Argentina";   pais = "Argentina" },
  @{ slug = "bra.1"; liga = "Brasileirao";      pais = "Brasil" },
  @{ slug = "usa.1"; liga = "MLS";              pais = "Estados Unidos" }
)

$wc = New-Object System.Net.WebClient
$wc.Encoding = [System.Text.Encoding]::UTF8

$clubes = New-Object System.Collections.ArrayList
$vistos = @{}
$ok = 0; $fail = 0

foreach ($l in $LIGAS) {
  $json = $wc.DownloadString("https://site.api.espn.com/apis/site/v2/sports/soccer/$($l.slug)/teams")
  $data = $json | ConvertFrom-Json
  $equipos = $data.sports[0].leagues[0].teams
  Write-Host ("{0}: {1} equipos" -f $l.liga, $equipos.Count)

  foreach ($e in $equipos) {
    $t = $e.team
    if ($vistos.ContainsKey($t.id)) { continue }
    $vistos[$t.id] = $true

    $destino = Join-Path $dir "$($t.id).png"
    if (-not ((Test-Path $destino) -and (Get-Item $destino).Length -gt 0)) {
      try {
        $wc.DownloadFile("https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/$($t.id).png&w=180&h=180", $destino)
        $ok++
        Start-Sleep -Milliseconds 60
      } catch {
        Write-Host "  fallo escudo $($t.displayName) ($($t.id)): $($_.Exception.Message)"
        $fail++
        continue   # sin escudo no entra al juego
      }
    } else { $ok++ }

    [void]$clubes.Add([ordered]@{
      id     = $t.id
      nombre = $t.displayName
      liga   = $l.liga
      pais   = $l.pais
    })
  }
}

# data/clubes.json + data/clubes.js (UTF-8 sin BOM)
$utf8 = New-Object System.Text.UTF8Encoding($false)
$salida = [ordered]@{
  fuente      = "ESPN (site API + teamlogos)"
  actualizado = (Get-Date -Format "yyyy-MM-dd")
  totalClubes = $clubes.Count
  clubes      = $clubes
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $raiz "data\clubes.json"), $salida, $utf8)
[System.IO.File]::WriteAllText((Join-Path $raiz "data\clubes.js"), "window.CASCARITA_CLUBES = $salida;", $utf8)

$peso = [math]::Round(((Get-ChildItem $dir -Filter *.png | Measure-Object Length -Sum).Sum / 1MB), 2)
Write-Host ""
Write-Host "LISTO -> assets\escudos\*.png  +  data\clubes.js"
Write-Host ("  Clubes: {0}  |  escudos OK: {1}  |  fallos: {2}  |  peso total: {3} MB" -f $clubes.Count, $ok, $fail, $peso)
