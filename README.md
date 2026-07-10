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
  toques/index.html      → Toques: clicker futbolero (/toques)
  draft/index.html       → El Draft: arma tu 11 con cartas (/draft)
  escudos/index.html     → Escudos: adivina el club (/escudos)
  contragolpe/index.html → Contragolpe: runner de fútbol (/contragolpe)
  trayectoria/index.html → La Trayectoria: adivina por la ruta de clubes (/trayectoria)
  tiroalangulo/index.html → Tiro al Ángulo: galería de tiro (/tiroalangulo)
  memorama/index.html    → Memorama de escudos (/memorama)
  vitrina/index.html     → La Vitrina: tríos en estantes, estilo goods sorting (/vitrina)
  penales/index.html     → Penales del día: tanda de 5 por timing (/penales)
  atajadas/index.html    → Atajadas: tú eres el portero (/atajadas)
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
    build-escudos.ps1    → baja equipos de 11 ligas de ESPN + escudos PNG y arma data/clubes.js
    build-jugadores-global.ps1 → plantillas + stats de las 5 grandes ligas (data/jugadores_global.js)
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
- **La Trayectoria** (`/trayectoria`): la carrera de un jugador club por club (escudos en
  fila con años, animación escalonada) y adivinas quién es — opción múltiple con señuelos
  de la misma posición y pista de posición/país. 5 diarias, filtro Liga MX | Global.
  Dataset `data/trayectorias.js` vía `scripts/build-trayectorias.ps1`: baja bio/teamHistory
  de ESPN para jugadores relevantes (>=12 PJ mx, >=15 PJ global), filtra selecciones y
  juveniles (nombre = país o U\d\d), exige >=3 clubes, y **descarga los escudos faltantes**
  de clubes por los que pasaron (Salzburg, Ajax de otras épocas, etc.) a assets/escudos/.
- **Escudos del día** (`/escudos`): adivina el club por su escudo — **229 clubes de 11
  ligas** (Liga MX, Premier, LaLiga, Serie A, Bundesliga, Ligue 1, Portugal, Eredivisie,
  Argentina, Brasil, MLS). 10 diarios, opción múltiple con **distractores de la misma
  liga** (la pista de liga/país no regala nada). El escudo se muestra **borroso**
  (blur CSS) porque muchos traen el nombre impreso; se revela nítido al responder.
  Escudos PNG 180px locales bajados de ESPN con `scripts/build-escudos.ps1`; clon
  estructural de Banderas (racha, compartir, modo libre).
- **Toques** (`/toques`): clicker/idle futbolero — haz dominadas tocando el balón, compra
  mejoras (×2 por toque) y "carrera" que genera toques por segundo (del balón parchado al
  Mundial). Rangos, logros, balón dorado sorpresa y **ganancia offline** (al volver recoges
  el 50% de lo producido, tope 8 h). Todo en `localStorage`; no es reto diario, es de retención.
- **El Draft** (`/draft`): arma tu 11 (4-3-3) en **dos modos con reto diario propio**:
  **Liga MX** y **Global 🌍** (las 5 grandes ligas europeas, ~2,000 jugadores de la campaña
  2025-26 vía `scripts/build-jugadores-global.ps1`, con colores de club reales de la API y
  ratings recalibrados a 38 jornadas — Haaland/Mbappé rondan 93-94). En global la química
  suma también por misma liga (+1). Estados, récords y semillas separados por modo
  (`draft:` vs `draftg:`). Al entrar, una **ruleta gira
  sola** y suelta 4 cartas de posiciones mezcladas (cola diaria única: misma secuencia
  para todos). Eliges una, tocas su posición iluminada en la cancha, y la siguiente tirada
  gira automáticamente. La tirada completa se consume elijas la que elijas, y solo hay
  **1 reroll**. La tirada siempre trae cartas que caben en algún hueco (sin bloqueos).
  Ratings 64-94 **derivados de la campaña real** (partidos, goles, titularidad, edad;
  porteros con bono de regularidad). **Avatares SVG deterministas** por jugador (piel/
  peinado por id, camiseta con colores del club) — ESPN no tiene headshots para ~96% de
  la Liga MX, y las fotos reales traen líos de derechos. **Química** estilo FIFA: 16
  conexiones entre posiciones vecinas (mismo club +3, misma nacionalidad +1) dibujadas
  sobre la cancha. Al completar el 11: **partido animado** contra el rival del día — tus
  fichas con avatar (el rival de gris) se mueven, se pasan la bola, empujan según quién
  ataca y el anotador festeja; narración y marcador. Goles con RNG determinista;
  coreografía Math.random (solo visual). Modo libre, récords y compartir.
- **Penales del día** (`/penales`): tanda de 5 por **timing** — la barra de puntería va y
  viene (y se acelera penal a penal); tocas para fijar el tiro. El **portero del día es el
  mismo para todos** (semilla diaria decide a dónde vuela en cada penal): a sus manos =
  atajado (alcance 0.28), muy abierto (>0.96) = poste/fuera. Marca de emojis 🟩⬛ por
  penal, una tanda oficial diaria + libres, récord/perfectos/racha.
- **Atajadas** (`/atajadas`): el espejo — ahora eres el portero. El tirador hace su
  carrera y **suelta una seña** 🟡 (flecha hacia donde va a tirar) cada vez más tarde
  (0.62 s → 0.38 s de reacción); tú **deslizas a una de 4 esquinas** (o te quedas al
  centro sin deslizar; teclado Q/A/E/D/S). Solo cuenta tu primera decisión. Los mismos
  5 tiros para todos (semilla diaria); comparte "Atajé 4/5 🧤".
- **Tiro al Ángulo** (`/tiroalangulo`): galería de tiro en canvas — 45 s de puntería sobre
  la portería: dianas por anillos (5/10/25 al centro), balones voladores (15), combo ×2
  con 5 seguidos... y el **árbitro** que NO debes tocar (−25). 6 balas por cargador,
  recarga automática (1.1 s), mira que sigue el mouse. Primera ronda del día = **oficial**
  (mismos blancos para todos, semilla diaria); las demás libres. Para Don Rogelio. 🎯
- **Memorama de escudos** (`/memorama`): 8 pares escondidos entre 16 cartas con flip 3D —
  el **mismo tablero para todos cada día** (clubes de `data/clubes.js`), cronómetro que
  arranca al primer volteo, intentos contados, nombre del club al hacer par (educativo),
  estado que sobrevive recargas, y ronda libre infinita. Para la Jefa Mirna. 🃏
- **La Vitrina** (`/vitrina`): estilo *goods sorting* — 7 estantes de madera con artículos
  de la tienda del club (emoji); toca uno y luego el estante destino: **3 iguales al
  frente = puf** (con cascadas y combo), y lo de atrás (oscurecido) pasa al frente. 10
  tríos por vitrina, 5 columnas libres garantizadas al arrancar (sin eso el tablero nace
  sin huecos = atascado de fábrica), detector de atasco con "reacomodar" (los movimientos
  siguen contando), tablero diario seeded + ronda libre. Para la Jefa Mirna. 🗄️
- **Contragolpe** (`/contragolpe`): runner de fútbol en canvas (360×560, sin sprites
  externos — todo dibujado). 3 carriles: desliza/flechas para cambiar, toca/espacio para
  saltar. Obstáculos: **defensas** y **conos** (se esquivan) y **barridas** (se saltan);
  balones dorados = +10 pts. La velocidad sube con el tiempo (320→640 px/s). La **primera
  corrida del día es la oficial** (cancha idéntica para todos vía semilla diaria, cuenta
  para el ranking); las demás son libres. Récord local, pausa automática al cambiar de
  pestaña, compartir.
- **Cancha** (`/cancha`): las alineaciones de la jornada en el campo, con la formación real,
  vía **fetch en vivo a ESPN** (scoreboard + summary; CORS `*`). Toca dos jugadores para
  compararlos con sus stats de temporada. Si no hay jornada en curso, cae a una jornada de
  2025 para demostrar. Las posiciones en la cancha son aproximadas (formación + posición).

**Filtro Liga MX | Global 🌍**: El Draft, ¿Quién es?, Trivia, Mayor o menor y el Comparador
traen selector de modo. Global = las 5 grandes ligas europeas (`data/jugadores_global.js`).
Cada modo tiene su reto diario, estado y récords propios (claves `quienesg:`, `triviag:`,
`mayoromenorg:`, `draftg:`); el modo elegido se recuerda por juego. Particularidades:
en ¿Quién es? Global la pista de equipo se pone amarilla si es la misma liga y el pozo
de respuestas pide >=10 PJ; la Trivia Global suma la pregunta "¿en qué liga juega?" y
solo usa equipos con pozo suficiente; el Comparador agrega fila de Liga y `&m=g` a la
URL compartible. `assets/hub.js` trae ~100 países ES↔EN (PAISES_INFO) para las opciones.

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
