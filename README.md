# ⚽ Cascarita — hub de juegos de fútbol mexicano

Juegos diarios y gratis de la Liga MX. Un reto nuevo cada día. Sitio estático (costo
cero) pensado para **Cloudflare Pages**; corre también con doble clic en `file://` para
desarrollo.

> **Cascarita** es un nombre de trabajo (la reta callejera). Para cambiar la marca:
> edita el texto del logo en cada `.html` y la constante `SITIO` en `wordle/index.html`.

## Estructura

```
cascarita/
  index.html            → portada del hub (/)
  wordle/index.html      → juego "¿Quién es?" (/wordle)
  trivia/index.html      → Trivia diaria (/trivia)
  mayoromenor/index.html → Mayor o menor (/mayoromenor)
  comparador/index.html  → Comparador de jugadores (/comparador)
  banderas/index.html    → Banderas del día (/banderas)
  cancha/index.html      → Cancha: alineaciones de la jornada (/cancha)
  assets/
    hub.css              → diseño compartido (tema claro/oscuro)
    hub.js               → utilidades: reto del día, rachas, normalización, países
    flags/*.png          → banderas (PNG, dominio público) para el juego Banderas
  data/
    jugadores.json       → dataset canónico de Liga MX
    jugadores.js         → mismo dataset como window.CASCARITA_DATA (para file://)
    paises.js            → países + ISO para Banderas (window.CASCARITA_PAISES)
  scripts/
    build-jugadores.ps1  → pipeline que baja las plantillas + stats de ESPN
    build-banderas.ps1   → descarga las banderas PNG y arma data/paises.js
```

## Cómo probar (local)

Doble clic en `index.html` (o `wordle/index.html`). No necesita servidor: los datos se
cargan como `.js`. El estado y la racha se guardan en `localStorage`.

## Refrescar datos (altas/bajas, edades)

```powershell
.\scripts\build-jugadores.ps1
```

Baja las 18 plantillas de Liga MX desde la API pública de ESPN y regenera
`data/jugadores.json` + `data/jugadores.js`. Además baja **goles y partidos** por jugador
(temporada `$STATS_SEASON`/`$STATS_TYPE`, hoy 2025/1 = Clausura 2025), así que tarda ~1-2 min
(una llamada por jugador). Reejecutar cada cierto tiempo (p. ej. al inicio de cada torneo);
actualizar `$STATS_SEASON`/`$STATS_TYPE` cuando ESPN publique una campaña más reciente.

## Desplegar (Cloudflare Pages, gratis)

```powershell
npx wrangler pages deploy . --project-name cascarita
```

## Juegos actuales

- **"¿Quién es?"** (`/wordle`): adivina al jugador misterioso de la Liga MX (mismo para
  todos cada día, hasta 8 intentos). Cada intento colorea las pistas: 🟩 coincide · 🟨 cerca
  (edad ±2, dorsal ±3) · ⬛ no. Al terminar compartes el resultado en emojis, estilo Wordle.
- **Trivia diaria** (`/trivia`): 5 preguntas autogeneradas de la Liga MX (equipo, país,
  posición, "cuál juega en", "quién NO juega en"), mismas para todos cada día. Racha y
  tarjeta para compartir.
- **Mayor o menor** (`/mayoromenor`): "¿quién metió más goles?" — secuencia diaria de
  goleadores (Clausura 2025); adivina si el siguiente marcó más o menos y encadena aciertos.
  Un intento por día, récord y tarjeta para compartir.
- **Comparador** (`/comparador`): dos jugadores cara a cara (goles, partidos, goles/partido,
  edad, país) con veredicto. NO es juego diario: es herramienta de referencia, con **URL
  compartible** `?a=<id>&b=<id>` (base para SEO de "X vs Y").
- **Banderas del día** (`/banderas`): el único NO deportivo — 10 banderas, opción múltiple,
  mismas para todos cada día. Público amplio (no requiere saber de fútbol). Usa imágenes PNG,
  no emoji (los emoji de bandera no se ven en Windows).
- **Cancha** (`/cancha`): las alineaciones de la jornada en el campo, con la formación real,
  vía **fetch en vivo a ESPN** (scoreboard + summary; CORS `*`). Toca dos jugadores para
  compararlos con sus stats de temporada. Si no hay jornada en curso, cae a una jornada de
  2025 para demostrar. Las posiciones en la cancha son aproximadas (formación + posición).

Los juegos diarios usan `assets/hub.js` (reto del día determinista, rachas, compartir); el
Comparador usa el dataset local; la Cancha llama a ESPN en vivo. Todo puro cliente, sin backend.

## Pendientes de calidad (datos)

- **Curar a jugadores conocidos**: el pozo de respuestas usa a todo squad con dorsal;
  para más justicia, limitar el misterioso diario a jugadores reconocidos (falta una
  señal de "fama" — p. ej. minutos jugados o una lista curada).
- **Cruz Azul y Tigres van con plantilla 2025**: ESPN aún no publica su roster 2026 en el
  endpoint normal (devuelve vacío), así que el pipeline los rellena con el core API
  (temporada 2025). Puede faltar algún fichaje nuevo. Refrescar cuando ESPN los popule.

> Los 18 equipos de ESPN son correctos: Mazatlán FC desapareció y Atlante ocupó su lugar.
> No falta ningún equipo.

## Roadmap del hub

Listos: **¿Quién es?** · **Trivia diaria** · **Mayor o menor** · **Comparador** · **Banderas** · **Cancha**.
Siguen: Quiniela (pick'em) + bracket · "Maneja y escucha" (radio + recorrido por ciudad).
