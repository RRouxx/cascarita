// Genera /aprende/equipos-liga-mx/index.html con texto ESTÁTICO (para SEO real:
// el contenido va en el HTML, no renderizado por JS). Datos de los datasets +
// intros escritas a mano por club. Correr: node scripts/build-aprende.mjs
import fs from "node:fs";

const clubes = JSON.parse(fs.readFileSync("data/clubes.json", "utf8")).clubes.filter(c => c.liga === "Liga MX");
const jugadores = JSON.parse(fs.readFileSync("data/jugadores.json", "utf8")).jugadores;

// Intros honestas por club (identidad + ciudad; sin inventar datos dudosos).
const INTRO = {
  "América": "El club más ganador del fútbol mexicano. Las Águilas, de la Ciudad de México, protagonizan con Chivas el Clásico Nacional, el partido más visto del país.",
  "Guadalajara": "El Rebaño Sagrado, de Guadalajara, Jalisco. Su seña de identidad es histórica: juega solo con futbolistas mexicanos. Junto al América forma el Clásico Nacional.",
  "Cruz Azul": "La Máquina Celeste, de la Ciudad de México. Uno de los clubes más queridos y con más títulos de la Liga MX.",
  "Pumas UNAM": "El club universitario de la UNAM, en la Ciudad de México. Cantera reconocida y una afición muy fiel en Ciudad Universitaria.",
  "Tigres UANL": "Los Felinos de la Universidad Autónoma de Nuevo León, en Monterrey. Una de las plantillas más competitivas del país en la última década.",
  "Monterrey": "Rayados, de Monterrey, Nuevo León. Junto a Tigres protagoniza el Clásico Regiomontano, uno de los más intensos de México.",
  "Toluca": "Los Diablos Rojos, del Estado de México. Juegan en una de las ciudades a mayor altitud de la liga, un factor que se siente en cada visita.",
  "Pachuca": "Los Tuzos, de Hidalgo. Es el club de fútbol más antiguo de México y una fábrica constante de jóvenes talentos.",
  "León": "La Fiera, de Guanajuato. Club de tradición y protagonista habitual en la pelea por el título.",
  "Santos": "Los Guerreros, de Torreón, Coahuila. Identidad norteña y una cantera que ha dado muchos seleccionados nacionales.",
  "Atlas": "Los Rojinegros, de Guadalajara. Comparten ciudad con Chivas en el Clásico Tapatío y presumen una de las aficiones más apasionadas.",
  "Necaxa": "Los Rayos, de Aguascalientes. Club histórico del fútbol mexicano, con títulos de liga en su palmarés.",
  "Puebla": "La Franja, de Puebla. Club tradicional del centro del país.",
  "Atlético de San Luis": "Club de San Luis Potosí, ligado al Atlético de Madrid, con un proyecto de identidad rojiblanca.",
  "Querétaro": "Los Gallos Blancos, de Querétaro. Club del Bajío con una afición fiel.",
  "FC Juarez": "Los Bravos, de Ciudad Juárez, Chihuahua. El fútbol de primera división en la frontera norte.",
  "Tijuana": "Los Xolos, de Tijuana, Baja California. Club fronterizo campeón de liga y con fuerte identidad regional.",
  "Atlante": "Los Potros de Hierro, club histórico de la Ciudad de México, de regreso en la primera división de la Liga MX.",
};

const POS = { POR: "porteros", DEF: "defensas", MED: "mediocampistas", DEL: "delanteros" };
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const paisES = { Mexico: "México", Argentina: "Argentina", Colombia: "Colombia", Uruguay: "Uruguay", Chile: "Chile", Brazil: "Brasil", Ecuador: "Ecuador", Paraguay: "Paraguay", Spain: "España", France: "Francia", Portugal: "Portugal", "United States": "Estados Unidos", Venezuela: "Venezuela", Peru: "Perú" };

function bloqueClub(nombre) {
  const plantel = jugadores.filter(p => p.equipo === nombre);
  const porPos = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
  plantel.forEach(p => { if (porPos[p.pos] != null) porPos[p.pos]++; });
  const extranjeros = [...new Set(plantel.filter(p => p.nac && p.nac !== "Mexico").map(p => paisES[p.nac] || p.nac))];
  const destacados = plantel
    .filter(p => (p.goles || 0) > 0 || p.titular)
    .sort((a, b) => (b.goles || 0) - (a.goles || 0) || (b.partidos || 0) - (a.partidos || 0))
    .slice(0, 6);
  const resumenPos = Object.entries(porPos).filter(([, n]) => n).map(([k, n]) => `${n} ${POS[k]}`).join(", ");
  const intro = INTRO[nombre] || `Uno de los 18 clubes de la Liga MX.`;
  return `
    <article class="club" id="${esc(nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">
      <h2>${esc(nombre)}</h2>
      <p>${esc(intro)}</p>
      <p><b>Plantilla actual:</b> ${plantel.length} jugadores registrados (${resumenPos}).${extranjeros.length ? ` Refuerzos extranjeros de ${extranjeros.slice(0, 6).join(", ")}${extranjeros.length > 6 ? " y más" : ""}.` : " Plantel mayoritariamente mexicano."}</p>
      ${destacados.length ? `<p><b>Algunos nombres del plantel:</b> ${destacados.map(p => esc(p.nombre) + (p.goles ? ` (${p.goles} ${p.goles === 1 ? "gol" : "goles"})` : "")).join(", ")}.</p>` : ""}
      <p class="jugar">🎮 ¿Reconoces a los jugadores de ${esc(nombre)}? Ponte a prueba en <a href="/wordle/">¿Quién es?</a>, <a href="/conecta/">Conecta</a> o arma tu quinteto en el <a href="/manager/">Mini-manager</a>.</p>
    </article>`;
}

const bloques = clubes.map(c => bloqueClub(c.nombre)).join("\n");
const totalJug = jugadores.length;

const html = `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2452147421495188" crossorigin="anonymous"></script>
  <title>Los 18 equipos de la Liga MX (Apertura 2026): plantillas y guía | Cascarita</title>
  <meta name="description" content="Guía de los 18 equipos de la Liga MX en el Apertura 2026: identidad, ciudad y plantillas actuales de América, Chivas, Cruz Azul, Tigres, Monterrey y todos los demás. Con ${totalJug} jugadores registrados.">
  <link rel="canonical" href="https://cascaritas.com.mx/aprende/equipos-liga-mx/">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/icon-180.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#0b1310">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Cascarita">
  <meta property="og:title" content="Los 18 equipos de la Liga MX (Apertura 2026)">
  <meta property="og:description" content="Identidad, ciudad y plantillas actuales de los 18 clubes de la Liga MX.">
  <meta property="og:image" content="https://cascaritas.com.mx/assets/og.png">
  <meta property="og:url" content="https://cascaritas.com.mx/aprende/equipos-liga-mx/">
  <link rel="stylesheet" href="../../assets/hub.css">
  <style>
    .art { max-width:760px; margin:0 auto; line-height:1.7; }
    .art h1 { font-size:1.7rem; margin-bottom:6px; }
    .art .lede { color:var(--texto-tenue); font-size:1.02rem; margin-bottom:20px; }
    .art h2 { font-size:1.25rem; margin:26px 0 6px; border-top:1px solid var(--borde); padding-top:20px; }
    .art p { margin:8px 0; }
    .art .jugar { font-size:.92rem; color:var(--texto-tenue); }
    .indice { background:var(--card); border:1px solid var(--borde); border-radius:12px; padding:14px 18px; margin:18px 0; }
    .indice h3 { margin:0 0 8px; font-size:.9rem; text-transform:uppercase; letter-spacing:.04em; color:var(--texto-tenue); }
    .indice a { display:inline-block; margin:2px 10px 2px 0; }
    .migas { font-size:.85rem; color:var(--texto-tenue); margin-bottom:10px; }
  </style>
</head>
<body>
  <header class="barra">
    <a class="logo" href="/"><span class="pelota">⚽</span> Cascarita</a>
    <span class="creced">Aprende</span>
  </header>
  <main class="contenedor">
    <div class="art">
      <div class="migas"><a href="/">Inicio</a> › <a href="/aprende/">Aprende</a> › Equipos de la Liga MX</div>
      <div class="encabezado" style="text-align:left"><h1>Los 18 equipos de la Liga MX (Apertura 2026)</h1></div>
      <p class="lede">La Liga MX es la primera división del fútbol mexicano. En el Apertura 2026 la disputan 18 clubes, desde gigantes como el América y las Chivas hasta plazas de tradición como Pachuca, Toluca o Necaxa. Abajo encontrarás la identidad de cada equipo y un resumen de su plantilla actual, con ${totalJug} jugadores registrados en total. Todos los datos vienen de fuentes públicas y se actualizan cada temporada.</p>

      <div class="indice">
        <h3>Ir a un equipo</h3>
        ${clubes.map(c => `<a href="#${esc(c.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${esc(c.nombre)}</a>`).join("")}
      </div>

      ${bloques}

      <h2 style="border:none">Pon a prueba lo que sabes</h2>
      <p>Si te sabes las plantillas de la Liga MX, Cascarita tiene un reto diario para ti: adivina al futbolista misterioso en <a href="/wordle/">¿Quién es?</a>, agrupa jugadores por club, posición o nacionalidad en <a href="/conecta/">Conecta</a>, arma tu quinteto de la jornada en el <a href="/manager/">Mini-manager</a> o compite en la <a href="/quiniela/">Quiniela</a> con tus amigos. Todos los juegos son gratis y cambian cada día.</p>
      <p><a href="/aprende/">← Volver a Aprende</a> · <a href="/">Ver todos los juegos</a></p>
    </div>
    <div class="anuncio">Espacio para anuncio</div>
  </main>
  <footer class="pie">
    <a href="/">← Volver a Cascarita</a> · Datos de fuentes públicas, actualizados cada temporada
  </footer>
  <script src="/assets/hub.js"></script>
</body>
</html>
`;

fs.mkdirSync("aprende/equipos-liga-mx", { recursive: true });
fs.writeFileSync("aprende/equipos-liga-mx/index.html", html);
console.log("aprende/equipos-liga-mx/index.html generado · " + clubes.length + " clubes · " + totalJug + " jugadores");
