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
- **El Draft** (`/draft`): arma tu 11 de la Liga MX (4-3-3). Al entrar, una **ruleta gira
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
