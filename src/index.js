// ============================================================
// Cascarita — Worker: sirve el sitio estático + API (auth, resultados, rankings).
// Los juegos son 100% jugables sin login; el login (Google) solo agrega
// ranking real, perfil y (después) grupos/comentarios.
// ============================================================

const JUEGOS = ["wordle", "trivia", "mayoromenor", "banderas"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await manejarApi(request, env, url); }
      catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    // Todo lo demás: el sitio estático (index.html de cada juego, assets, etc.)
    return env.ASSETS.fetch(request);
  }
};

// ---------------- Router de API ----------------
async function manejarApi(request, env, url) {
  const p = url.pathname;
  const m = request.method;

  if (p === "/api/config") return json({ googleClientId: env.GOOGLE_CLIENT_ID || "", facebookAppId: env.FACEBOOK_APP_ID || "" });
  if (p === "/api/me") return me(request, env);
  if (p === "/api/auth/google" && m === "POST") return authGoogle(request, env);
  if (p === "/api/auth/facebook" && m === "POST") return authFacebook(request, env);
  if (p === "/api/logout" && m === "POST") return logout();
  if (p === "/api/resultado" && m === "POST") return guardarResultado(request, env);
  if (p.startsWith("/api/ranking/")) return ranking(env, decodeURIComponent(p.slice("/api/ranking/".length)));

  // Quiniela de grupos
  if (p === "/api/quiniela/partidos") return quinielaPartidos(request, env);
  if (p === "/api/quiniela/predecir" && m === "POST") return quinielaPredecir(request, env);
  if (p === "/api/grupo/crear" && m === "POST") return grupoCrear(request, env);
  if (p === "/api/grupo/unir" && m === "POST") return grupoUnir(request, env);
  if (p === "/api/grupo/salir" && m === "POST") return grupoSalir(request, env);
  if (p === "/api/grupo/borrar" && m === "POST") return grupoBorrar(request, env);
  if (p === "/api/grupo/mios") return grupoMios(request, env);
  if (p.startsWith("/api/grupo/")) return grupoTabla(request, env, decodeURIComponent(p.slice("/api/grupo/".length)));

  // Comentarios
  if (p === "/api/comentario" && m === "POST") return comentarioPublicar(request, env);
  if (p.startsWith("/api/comentarios/")) return comentariosListar(env, decodeURIComponent(p.slice("/api/comentarios/".length)));

  return json({ error: "no encontrado" }, 404);
}

// ---------------- Utilidades HTTP ----------------
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

// ---------------- Sesión (JWT HS256 con Web Crypto) ----------------
const te = new TextEncoder();

function b64urlFromBytes(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromStr(str) {
  return b64urlFromBytes(te.encode(str));
}
function bytesFromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function strFromB64url(s) {
  return new TextDecoder().decode(bytesFromB64url(s));
}

async function claveHmac(env) {
  const secreto = env.SESSION_SECRET || "dev-inseguro-cambia-esto";
  return crypto.subtle.importKey("raw", te.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function firmarSesion(payload, env) {
  const cuerpo = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }; // 30 días
  const head = b64urlFromStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlFromStr(JSON.stringify(cuerpo));
  const key = await claveHmac(env);
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(head + "." + body));
  return `${head}.${body}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

async function verificarSesion(token, env) {
  if (!token || !env.SESSION_SECRET) return null; // sin secreto: ninguna sesión es válida
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [head, body, sig] = partes;
  const key = await claveHmac(env);
  const ok = await crypto.subtle.verify("HMAC", key, bytesFromB64url(sig), te.encode(head + "." + body));
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(strFromB64url(body)); } catch { return null; }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function cookieSesion(token) {
  return `sesion=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
}
function cookieBorrar() {
  return `sesion=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function usuarioDe(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)sesion=([^;]+)/);
  if (!m) return null;
  return verificarSesion(m[1], env);
}

// ---------------- Auth con Google (ID token de GIS) ----------------
async function authGoogle(request, env) {
  if (!env.SESSION_SECRET) return json({ error: "login no configurado aún (falta SESSION_SECRET)" }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "cuerpo inválido" }, 400); }
  const credential = body && body.credential;
  if (!credential) return json({ error: "falta credential" }, 400);

  // Verificar el ID token contra Google
  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!r.ok) return json({ error: "token inválido" }, 401);
  const info = await r.json();

  if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: "audiencia incorrecta" }, 401);
  if (!["accounts.google.com", "https://accounts.google.com"].includes(info.iss)) return json({ error: "emisor incorrecto" }, 401);
  if (!info.sub) return json({ error: "sin sub" }, 401);

  const uid = "g:" + info.sub;
  const nombre = (info.name || info.given_name || "Jugador").slice(0, 40);
  const avatar = info.picture || "";
  const email = info.email || "";

  await env.cascarita.prepare(
    `INSERT INTO usuarios (id, email, nombre, avatar) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, avatar=excluded.avatar, email=excluded.email`
  ).bind(uid, email, nombre, avatar).run();

  const token = await firmarSesion({ uid, nombre, avatar }, env);
  return json({ ok: true, usuario: { id: uid, nombre, avatar } }, 200, { "Set-Cookie": cookieSesion(token) });
}

// ---- Auth con Facebook (access token del SDK JS) ----
async function authFacebook(request, env) {
  if (!env.SESSION_SECRET) return json({ error: "login no configurado aún" }, 503);
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) return json({ error: "facebook no configurado" }, 503);
  const d = await request.json().catch(() => null);
  const token = d && d.token;
  if (!token) return json({ error: "falta token" }, 400);

  // Verificar que el token es válido Y de NUESTRA app
  const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
  const dbg = await (await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`
  )).json();
  if (!dbg.data || !dbg.data.is_valid || String(dbg.data.app_id) !== String(env.FACEBOOK_APP_ID)) {
    return json({ error: "token inválido" }, 401);
  }

  const perf = await (await fetch(
    `https://graph.facebook.com/me?fields=id,name,picture.width(200)&access_token=${encodeURIComponent(token)}`
  )).json();
  if (!perf.id) return json({ error: "sin perfil" }, 401);

  const uid = "f:" + perf.id;
  const nombre = (perf.name || "Jugador").slice(0, 40);
  const avatar = (perf.picture && perf.picture.data && perf.picture.data.url) || "";

  await env.cascarita.prepare(
    `INSERT INTO usuarios (id, email, nombre, avatar) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, avatar=excluded.avatar`
  ).bind(uid, "", nombre, avatar).run();

  const sesTok = await firmarSesion({ uid, nombre, avatar }, env);
  return json({ ok: true, usuario: { id: uid, nombre, avatar } }, 200, { "Set-Cookie": cookieSesion(sesTok) });
}

async function me(request, env) {
  const u = await usuarioDe(request, env);
  return json({ usuario: u ? { id: u.uid, nombre: u.nombre, avatar: u.avatar } : null });
}

function logout() {
  return json({ ok: true }, 200, { "Set-Cookie": cookieBorrar() });
}

// ---------------- Resultados y rankings ----------------
async function guardarResultado(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);

  let d;
  try { d = await request.json(); } catch { return json({ error: "cuerpo inválido" }, 400); }
  if (!JUEGOS.includes(d.juego)) return json({ error: "juego inválido" }, 400);

  const fecha = String(d.fecha || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "fecha inválida" }, 400);
  const dia = parseInt(d.dia) || 0;
  const puntaje = Math.max(0, Math.min(1000, parseInt(d.puntaje) || 0));
  const gano = d.gano ? 1 : 0;

  await env.cascarita.prepare(
    `INSERT INTO resultados (usuario_id, juego, fecha, dia, puntaje, gano) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario_id, juego, fecha) DO UPDATE SET puntaje=excluded.puntaje, gano=excluded.gano, dia=excluded.dia`
  ).bind(u.uid, d.juego, fecha, dia, puntaje, gano).run();

  return json({ ok: true });
}

async function ranking(env, juego) {
  if (!JUEGOS.includes(juego)) return json({ error: "juego inválido" }, 400);
  const { results } = await env.cascarita.prepare(
    `SELECT u.nombre AS nombre, u.avatar AS avatar,
            SUM(r.puntaje) AS puntos, COUNT(*) AS jugados
       FROM resultados r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.juego = ?
      GROUP BY r.usuario_id
      ORDER BY puntos DESC, jugados DESC
      LIMIT 20`
  ).bind(juego).all();
  return json({ juego, tabla: results || [] });
}

// ---------------- Quiniela de grupos ----------------
const RESULTADOS = ["L", "E", "V"];

function codigoGrupo() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin I,O,L,0,1 (ambiguos)
  let s = ""; for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
function fmtFecha(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function mapEvento(ev) {
  if (!ev.competitions || !ev.competitions[0]) return null;
  const c = ev.competitions[0].competitors || [];
  if (c.length < 2) return null;
  const h = c.find(x => x.homeAway === "home") || c[0];
  const a = c.find(x => x.homeAway === "away") || c[1];
  const estado = ev.status && ev.status.type ? ev.status.type.state : "pre";
  let resultado = null, marcador = null;
  if (estado === "post") {
    const hs = parseInt(h.score), as = parseInt(a.score);
    if (!isNaN(hs) && !isNaN(as)) { marcador = `${hs}-${as}`; resultado = hs > as ? "L" : (hs < as ? "V" : "E"); }
  }
  return {
    evento: String(ev.id), inicio: ev.date, fecha: ev.date.slice(0, 10), estado, marcador, resultado,
    local: h.team.shortDisplayName || h.team.displayName, localAbbr: h.team.abbreviation,
    visitante: a.team.shortDisplayName || a.team.displayName, visitanteAbbr: a.team.abbreviation
  };
}

async function espnRango(f1, f2) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard?dates=${f1}-${f2}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.events || []).map(mapEvento).filter(Boolean);
}
async function traerPartidos() {
  const hoy = new Date();
  const a = new Date(hoy); a.setDate(a.getDate() - 3);
  const b = new Date(hoy); b.setDate(b.getDate() + 12);
  const evs = await espnRango(fmtFecha(a), fmtFecha(b));
  return evs.sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
}
async function traerResultados(f1, f2) {
  const evs = await espnRango(f1, f2);
  const mapa = {};
  evs.forEach(e => { if (e.resultado) mapa[e.evento] = e.resultado; });
  return mapa;
}

async function quinielaPartidos(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const partidos = await traerPartidos();
  const ids = partidos.map(p => p.evento);
  const mis = {};
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const { results } = await env.cascarita.prepare(
      `SELECT evento, pred FROM predicciones WHERE usuario_id = ? AND evento IN (${ph})`
    ).bind(u.uid, ...ids).all();
    (results || []).forEach(r => { mis[r.evento] = r.pred; });
  }
  partidos.forEach(p => { p.miPred = mis[p.evento] || null; });
  return json({ partidos });
}

async function quinielaPredecir(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => null);
  if (!d || !d.evento || !RESULTADOS.includes(d.pred)) return json({ error: "datos inválidos" }, 400);
  const partidos = await traerPartidos();
  const p = partidos.find(x => x.evento === String(d.evento));
  if (!p) return json({ error: "partido no disponible" }, 400);
  if (p.estado !== "pre") return json({ error: "el partido ya empezó" }, 400);
  await env.cascarita.prepare(
    `INSERT INTO predicciones (usuario_id, evento, fecha, pred) VALUES (?, ?, ?, ?)
     ON CONFLICT(usuario_id, evento) DO UPDATE SET pred = excluded.pred`
  ).bind(u.uid, String(d.evento), p.fecha, d.pred).run();
  return json({ ok: true });
}

async function grupoCrear(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => ({}));
  const nombre = (String(d.nombre || "").trim() || "Mi grupo").slice(0, 40);
  let codigo = null;
  for (let i = 0; i < 6; i++) {
    const c = codigoGrupo();
    const ex = await env.cascarita.prepare("SELECT codigo FROM grupos WHERE codigo = ?").bind(c).first();
    if (!ex) { codigo = c; break; }
  }
  if (!codigo) return json({ error: "intenta de nuevo" }, 500);
  await env.cascarita.prepare("INSERT INTO grupos (codigo, nombre, creador_id) VALUES (?, ?, ?)").bind(codigo, nombre, u.uid).run();
  await env.cascarita.prepare("INSERT OR IGNORE INTO grupo_miembros (codigo, usuario_id) VALUES (?, ?)").bind(codigo, u.uid).run();
  return json({ ok: true, codigo, nombre });
}

async function grupoUnir(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => ({}));
  const codigo = String(d.codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const g = await env.cascarita.prepare("SELECT codigo, nombre FROM grupos WHERE codigo = ?").bind(codigo).first();
  if (!g) return json({ error: "grupo no encontrado" }, 404);
  await env.cascarita.prepare("INSERT OR IGNORE INTO grupo_miembros (codigo, usuario_id) VALUES (?, ?)").bind(codigo, u.uid).run();
  return json({ ok: true, codigo: g.codigo, nombre: g.nombre });
}

async function grupoMios(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const { results } = await env.cascarita.prepare(
    `SELECT g.codigo AS codigo, g.nombre AS nombre,
            (SELECT COUNT(*) FROM grupo_miembros m2 WHERE m2.codigo = g.codigo) AS miembros
       FROM grupo_miembros m JOIN grupos g ON g.codigo = m.codigo
      WHERE m.usuario_id = ? ORDER BY g.creado DESC`
  ).bind(u.uid).all();
  return json({ grupos: results || [] });
}

async function grupoSalir(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => ({}));
  const codigo = String(d.codigo || "").toUpperCase();
  await env.cascarita.prepare("DELETE FROM grupo_miembros WHERE codigo = ? AND usuario_id = ?").bind(codigo, u.uid).run();
  return json({ ok: true });
}

async function grupoBorrar(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => ({}));
  const codigo = String(d.codigo || "").toUpperCase();
  const g = await env.cascarita.prepare("SELECT creador_id FROM grupos WHERE codigo = ?").bind(codigo).first();
  if (!g) return json({ error: "grupo no encontrado" }, 404);
  if (g.creador_id !== u.uid) return json({ error: "solo el creador puede borrar el grupo" }, 403);
  await env.cascarita.prepare("DELETE FROM grupo_miembros WHERE codigo = ?").bind(codigo).run();
  await env.cascarita.prepare("DELETE FROM grupos WHERE codigo = ?").bind(codigo).run();
  return json({ ok: true });
}

async function grupoTabla(request, env, codigo) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  codigo = String(codigo || "").toUpperCase();
  const g = await env.cascarita.prepare("SELECT codigo, nombre, creador_id FROM grupos WHERE codigo = ?").bind(codigo).first();
  if (!g) return json({ error: "grupo no encontrado" }, 404);

  const miembros = (await env.cascarita.prepare(
    `SELECT u.id AS id, u.nombre AS nombre, u.avatar AS avatar
       FROM grupo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.codigo = ?`
  ).bind(codigo).all()).results || [];

  const ids = miembros.map(m => m.id);
  let preds = [];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    preds = (await env.cascarita.prepare(
      `SELECT usuario_id, evento, pred, fecha FROM predicciones WHERE usuario_id IN (${ph})`
    ).bind(...ids).all()).results || [];
  }

  let mapa = {};
  if (preds.length) {
    const fechas = preds.map(p => p.fecha).sort();
    mapa = await traerResultados(fechas[0].replace(/-/g, ""), fechas[fechas.length - 1].replace(/-/g, ""));
  }

  const pts = {}, jug = {};
  miembros.forEach(m => { pts[m.id] = 0; jug[m.id] = 0; });
  preds.forEach(pr => {
    const r = mapa[pr.evento];
    if (r) { jug[pr.usuario_id] = (jug[pr.usuario_id] || 0) + 1; if (pr.pred === r) pts[pr.usuario_id] = (pts[pr.usuario_id] || 0) + 1; }
  });

  const tabla = miembros.map(m => ({ nombre: m.nombre, avatar: m.avatar, puntos: pts[m.id] || 0, jugados: jug[m.id] || 0 }))
    .sort((a, b) => b.puntos - a.puntos || b.jugados - a.jugados);
  return json({ codigo: g.codigo, nombre: g.nombre, esCreador: g.creador_id === u.uid, tabla });
}

// ---------------- Comentarios ----------------
const RX_SECCION = /^[a-z0-9:_-]{1,40}$/i;

async function comentariosListar(env, seccion) {
  if (!RX_SECCION.test(seccion)) return json({ error: "sección inválida" }, 400);
  const { results } = await env.cascarita.prepare(
    `SELECT u.nombre AS nombre, u.avatar AS avatar, c.texto AS texto, c.creado AS creado
       FROM comentarios c JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.seccion = ? ORDER BY c.id DESC LIMIT 50`
  ).bind(seccion).all();
  return json({ seccion, comentarios: results || [] });
}

async function comentarioPublicar(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => ({}));
  const seccion = String(d.seccion || "");
  const texto = String(d.texto || "").trim().slice(0, 500);
  if (!RX_SECCION.test(seccion)) return json({ error: "sección inválida" }, 400);
  if (!texto) return json({ error: "comentario vacío" }, 400);
  await env.cascarita.prepare("INSERT INTO comentarios (seccion, usuario_id, texto) VALUES (?, ?, ?)").bind(seccion, u.uid, texto).run();
  return json({ ok: true });
}
