// ============================================================
// Cascarita — Worker: sirve el sitio estático + API (auth, resultados, rankings).
// Los juegos son 100% jugables sin login; el login (Google) solo agrega
// ranking real, perfil y (después) grupos/comentarios.
// ============================================================

import { POOL, PRESUPUESTO, TAM_EQUIPO, MAX_POR_EQUIPO } from "./manager-pool.js";

// Juegos con ranking (suman puntaje por día; el puntaje se topa a 0-1000 como anti-trampa).
// Toques va aparte (/api/toques) por ser idle con número enorme y validación propia.
const JUEGOS = [
  "wordle", "trivia", "mayoromenor", "costomas", "contexto", "banderas", "escudos", "trayectoria",
  "memorama", "penales", "atajadas", "tiro", "contragolpe", "vitrina", "draft", "conecta"
];

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
  if (p.startsWith("/api/ranking/")) return ranking(request, env, decodeURIComponent(p.slice("/api/ranking/".length)));

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

  // Panel de creador (moderación)
  if (p === "/api/admin/usuarios") return adminUsuarios(request, env);
  if (p === "/api/admin/ocultar" && m === "POST") return adminOcultar(request, env);
  if (p === "/api/admin/borrar" && m === "POST") return adminBorrar(request, env);

  // Ranking de Toques (idle, con anti-trampas)
  if (p === "/api/toques" && m === "POST") return toquesGuardar(request, env);
  if (p === "/api/toques/estado") return toquesEstado(request, env);
  if (p === "/api/toques/ranking") return toquesRanking(request, env);

  // Mini-manager semanal
  if (p === "/api/manager/jornada") return managerJornada(request, env);
  if (p === "/api/manager/guardar" && m === "POST") return managerGuardar(request, env);
  if (p === "/api/manager/tabla") return managerTabla(request, env, url.searchParams.get("jornada"));
  if (p.startsWith("/api/manager/grupo/")) return managerGrupo(request, env, decodeURIComponent(p.slice("/api/manager/grupo/".length)), url.searchParams.get("jornada"));

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

async function ranking(request, env, juego) {
  if (!JUEGOS.includes(juego)) return json({ error: "juego inválido" }, 400);
  const { results } = await env.cascarita.prepare(
    `SELECT u.nombre AS nombre, u.avatar AS avatar,
            SUM(r.puntaje) AS puntos, COUNT(*) AS jugados
       FROM resultados r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.juego = ? AND COALESCE(u.oculto, 0) = 0
      GROUP BY r.usuario_id
      ORDER BY puntos DESC, jugados DESC
      LIMIT 20`
  ).bind(juego).all();

  // Posición del que consulta (aunque esté fuera del top 20).
  let miRank = null;
  const u = await usuarioDe(request, env);
  if (u) {
    const mio = await env.cascarita.prepare(
      "SELECT SUM(puntaje) AS puntos, COUNT(*) AS jugados FROM resultados WHERE usuario_id = ? AND juego = ?"
    ).bind(u.uid, juego).first();
    if (mio && mio.puntos != null) {
      const adelante = await env.cascarita.prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT SUM(r.puntaje) AS p, COUNT(*) AS j
             FROM resultados r JOIN usuarios u2 ON u2.id = r.usuario_id
            WHERE r.juego = ? AND COALESCE(u2.oculto, 0) = 0
            GROUP BY r.usuario_id
         ) WHERE p > ? OR (p = ? AND j > ?)`
      ).bind(juego, mio.puntos, mio.puntos, mio.jugados).first();
      miRank = { pos: (adelante ? adelante.n : 0) + 1, puntos: mio.puntos, nombre: u.nombre, avatar: u.avatar };
    }
  }
  return json({ juego, tabla: results || [], miRank });
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
  // ESPN agrupa su scoreboard por fecha del ESTE de EE.UU.: un partido de las
  // 01:00Z del día X vive en el scoreboard del día X−1 (nos comió los juegos
  // del jueves de la J1 del Apertura 2026). Pedimos un día extra por lado y
  // filtramos por la fecha UTC del evento → el rango pedido es exacto SIEMPRE.
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard?dates=${ymdMasDias(f1, -1)}-${ymdMasDias(f2, 1)}`);
  if (!r.ok) return [];
  const j = await r.json();
  const a = `${f1.slice(0, 4)}-${f1.slice(4, 6)}-${f1.slice(6, 8)}`;
  const b = `${f2.slice(0, 4)}-${f2.slice(4, 6)}-${f2.slice(6, 8)}`;
  return (j.events || []).map(mapEvento).filter(Boolean).filter(e => e.fecha >= a && e.fecha <= b);
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
       FROM grupo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.codigo = ? AND COALESCE(u.oculto, 0) = 0`
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

// ============================================================
// Panel de creador — moderar los rankings (ocultar / borrar usuarios).
// Solo entra quien inicia sesión con un correo de env.ADMIN_EMAILS. La
// verificación se hace con el correo GUARDADO del usuario (login de Google
// verificado), no con nada que mande el cliente.
// ============================================================
async function esAdmin(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return null;
  const admins = String(env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) return null;
  const row = await env.cascarita.prepare("SELECT email FROM usuarios WHERE id = ?").bind(u.uid).first();
  const email = String((row && row.email) || "").toLowerCase();
  return (email && admins.includes(email)) ? u : null;
}

async function adminUsuarios(request, env) {
  const admin = await esAdmin(request, env);
  if (!admin) return json({ error: "no autorizado" }, 403);
  const { results } = await env.cascarita.prepare(
    `SELECT u.id AS id, u.nombre AS nombre, u.email AS email, u.avatar AS avatar,
            COALESCE(u.oculto, 0) AS oculto, u.creado AS creado,
            (SELECT COUNT(*) FROM resultados r WHERE r.usuario_id = u.id) AS resultados,
            (SELECT COUNT(*) FROM manager_equipos e WHERE e.usuario_id = u.id) AS manager,
            (SELECT COUNT(*) FROM predicciones pr WHERE pr.usuario_id = u.id) AS predicciones,
            (SELECT COUNT(*) FROM comentarios c WHERE c.usuario_id = u.id) AS comentarios
       FROM usuarios u ORDER BY u.creado DESC LIMIT 500`
  ).all();
  return json({ usuarios: results || [], yo: admin.uid });
}

async function adminOcultar(request, env) {
  const admin = await esAdmin(request, env);
  if (!admin) return json({ error: "no autorizado" }, 403);
  const d = await request.json().catch(() => ({}));
  const id = String(d.id || "");
  if (!id) return json({ error: "falta id" }, 400);
  const oculto = d.oculto ? 1 : 0;
  await env.cascarita.prepare("UPDATE usuarios SET oculto = ? WHERE id = ?").bind(oculto, id).run();
  return json({ ok: true, id, oculto });
}

async function adminBorrar(request, env) {
  const admin = await esAdmin(request, env);
  if (!admin) return json({ error: "no autorizado" }, 403);
  const d = await request.json().catch(() => ({}));
  const id = String(d.id || "");
  if (!id) return json({ error: "falta id" }, 400);
  const db = env.cascarita;
  // Borra al usuario y TODO su rastro (rankings, manager, quiniela, comentarios, grupos que creó).
  await db.batch([
    db.prepare("DELETE FROM resultados WHERE usuario_id = ?").bind(id),
    db.prepare("DELETE FROM predicciones WHERE usuario_id = ?").bind(id),
    db.prepare("DELETE FROM manager_equipos WHERE usuario_id = ?").bind(id),
    db.prepare("DELETE FROM comentarios WHERE usuario_id = ?").bind(id),
    db.prepare("DELETE FROM grupo_miembros WHERE usuario_id = ?").bind(id),
    db.prepare("DELETE FROM grupo_miembros WHERE codigo IN (SELECT codigo FROM grupos WHERE creador_id = ?)").bind(id),
    db.prepare("DELETE FROM grupos WHERE creador_id = ?").bind(id),
    db.prepare("DELETE FROM usuarios WHERE id = ?").bind(id)
  ]);
  return json({ ok: true, id });
}

// ============================================================
// Ranking de Toques (idle) con anti-trampas.
// Un idle 100% cliente no se puede blindar del todo, pero el servidor:
//   1) topa la PRIMERA sincronización (evita "nazco con 10^30"),
//   2) limita el SALTO entre sincronizaciones por el TIEMPO real transcurrido
//      (a lo mucho ×8 por minuto + un piso lineal), y es monótono (nunca baja).
// El ranking se lee del valor VALIDADO por el servidor, no del cliente, y el
// creador puede ocultar/borrar tramposos desde /admin.
// ============================================================
const TOQUES_CAP_INICIAL = 1e9;    // tope de la 1ª sincronización
const TOQUES_PISO = 1e7;           // piso lineal de crecimiento por segundo

// Valor aceptable dado el previo, el reportado y los segundos desde la última sync.
function aceptarToques(prev, total, elapsedSeg) {
  if (!(prev > 0)) return Math.min(total, TOQUES_CAP_INICIAL);
  const s = Math.max(1, elapsedSeg);
  const maxGain = prev * (Math.pow(8, s / 60) - 1) + TOQUES_PISO * s; // hasta ×8/min + piso
  return Math.max(prev, Math.min(total, prev + maxGain));             // monótono y con techo
}

async function toquesGuardar(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => null);
  const total = Number(d && d.total);
  let estrellas = Math.max(0, Math.floor(Number(d && d.estrellas) || 0));
  if (!isFinite(total) || total < 0) return json({ error: "dato inválido" }, 400);

  const ahora = Date.now();
  const row = await env.cascarita.prepare(
    "SELECT mejor, primer_ms, actualizado_ms FROM toques_ranking WHERE usuario_id = ?"
  ).bind(u.uid).first();

  const prev = row ? (row.mejor || 0) : 0;
  const elapsed = row ? (ahora - (row.actualizado_ms || ahora)) / 1000 : 0;
  const aceptado = aceptarToques(prev, total, elapsed);
  const primer = row ? row.primer_ms : ahora;
  // estrellas plausibles según el total aceptado
  estrellas = Math.min(estrellas, Math.floor(Math.sqrt(aceptado / 1e6)) + 1);

  // Estado COMPLETO del juego (continuidad entre dispositivos). Es un blob de
  // cortesía: el ranking sigue mandando `mejor` (validado arriba). Si no viene
  // (modo pruebas / cliente viejo), se conserva el anterior (COALESCE).
  let estadoRaw = null;
  if (d && d.estado && typeof d.estado === "object") {
    const s = JSON.stringify(d.estado);
    if (s.length <= 24000) estadoRaw = s;
  }

  await env.cascarita.prepare(
    `INSERT INTO toques_ranking (usuario_id, mejor, estrellas, primer_ms, actualizado_ms, estado)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET mejor=excluded.mejor, estrellas=excluded.estrellas,
       actualizado_ms=excluded.actualizado_ms, estado=COALESCE(excluded.estado, toques_ranking.estado)`
  ).bind(u.uid, aceptado, estrellas, primer, ahora, estadoRaw).run();

  return json({ ok: true, aceptado });
}

// La carrera guardada en la cuenta (para retomarla desde cualquier dispositivo).
async function toquesEstado(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const row = await env.cascarita.prepare(
    "SELECT estado, mejor FROM toques_ranking WHERE usuario_id = ?"
  ).bind(u.uid).first();
  let estado = null;
  if (row && row.estado) { try { estado = JSON.parse(row.estado); } catch (e) { } }
  return json({ estado, mejor: row ? row.mejor || 0 : 0 });
}

async function toquesRanking(request, env) {
  const { results } = await env.cascarita.prepare(
    `SELECT u.nombre AS nombre, u.avatar AS avatar, t.mejor AS mejor, t.estrellas AS estrellas
       FROM toques_ranking t JOIN usuarios u ON u.id = t.usuario_id
      WHERE COALESCE(u.oculto, 0) = 0
      ORDER BY t.mejor DESC LIMIT 20`
  ).all();

  let miRank = null;
  const u = await usuarioDe(request, env);
  if (u) {
    const mio = await env.cascarita.prepare("SELECT mejor, estrellas FROM toques_ranking WHERE usuario_id = ?").bind(u.uid).first();
    if (mio) {
      const adelante = await env.cascarita.prepare(
        `SELECT COUNT(*) AS n FROM toques_ranking t JOIN usuarios u2 ON u2.id = t.usuario_id
          WHERE COALESCE(u2.oculto, 0) = 0 AND t.mejor > ?`
      ).bind(mio.mejor).first();
      miRank = { pos: (adelante ? adelante.n : 0) + 1, mejor: mio.mejor, estrellas: mio.estrellas, nombre: u.nombre, avatar: u.avatar };
    }
  }
  return json({ tabla: results || [], miRank });
}

// ============================================================
// Mini-manager semanal — armas un quinteto y sumas puntos según lo que
// hagan tus jugadores en la jornada REAL (fantasy). Los puntos se calculan
// en vivo desde los box scores de ESPN. Une draft (armar equipo) + quiniela
// (la jornada real) + login (leaderboard global y por grupo).
// ============================================================
const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/summary?event=";
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const n2 = v => { const x = typeof v === "number" ? v : parseFloat(v); return isFinite(x) ? x : 0; };

function ymdMasDias(ymd, dias) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function fmtUTC(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function etiquetaFechas(partidos) {
  if (!partidos.length) return "Jornada";
  const fs = partidos.map(p => p.fecha).sort();
  const d1 = fs[0].split("-"), d2 = fs[fs.length - 1].split("-");
  const a = `${+d1[2]} ${MESES_ES[+d1[1] - 1]}`;
  const b = `${+d2[2]} ${MESES_ES[+d2[1] - 1]}`;
  return d1[2] === d2[2] && d1[1] === d2[1] ? a : `${+d1[2]}–${b}`;
}

// La "jornada de la semana": el primer cúmulo de partidos a la vista.
async function jornadaActual() {
  const hoy = new Date();
  const a = new Date(hoy); a.setUTCDate(a.getUTCDate() - 3);
  const b = new Date(hoy); b.setUTCDate(b.getUTCDate() + 13);
  const evs = (await espnRango(fmtUTC(a), fmtUTC(b))).sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
  if (!evs.length) return { id: null, nombre: "Sin jornada", inicio: null, deadline: null, abierta: false, partidos: [] };
  const primero = evs[0];
  const jFecha = primero.fecha;                 // YYYY-MM-DD (fecha del primer partido)
  const jId = jFecha.replace(/-/g, "");
  const finYMD = ymdMasDias(jId, 4);
  const finFecha = `${finYMD.slice(0, 4)}-${finYMD.slice(4, 6)}-${finYMD.slice(6, 8)}`;
  const partidos = evs.filter(e => e.fecha >= jFecha && e.fecha <= finFecha);
  const abierta = Date.now() < Date.parse(primero.inicio);
  return { id: jId, nombre: etiquetaFechas(partidos), inicio: primero.inicio, deadline: primero.inicio, abierta, partidos };
}

async function eventosDeJornada(jId) {
  if (!/^\d{8}$/.test(jId || "")) return [];
  const jFecha = `${jId.slice(0, 4)}-${jId.slice(4, 6)}-${jId.slice(6, 8)}`;
  const finYMD = ymdMasDias(jId, 4);
  const finFecha = `${finYMD.slice(0, 4)}-${finYMD.slice(4, 6)}-${finYMD.slice(6, 8)}`;
  const evs = await espnRango(jId, finYMD);
  return evs.filter(e => e.fecha >= jFecha && e.fecha <= finFecha);
}

// Box score por jugador de toda la jornada: id de jugador (ESPN) -> stats del partido.
async function statsJornada(jId) {
  const eventos = await eventosDeJornada(jId);
  const mapa = {};
  await Promise.all(eventos.map(async ev => {
    let d;
    try { const r = await fetch(SUMMARY + ev.evento); if (!r.ok) return; d = await r.json(); }
    catch (e) { return; }
    const rosters = d.rosters || [];
    const comp = (d.header && d.header.competitions && d.header.competitions[0] && d.header.competitions[0].competitors) || [];
    const score = {}; let golesTotales = 0;
    comp.forEach(c => { const v = n2(c.score); score[c.team && c.team.id] = v; golesTotales += v; });
    rosters.forEach(tb => {
      const teamId = tb.team && tb.team.id;
      const concedidos = golesTotales - (score[teamId] || 0);  // 2 equipos: lo del rival
      (tb.roster || []).forEach(pl => {
        const aid = String((pl.athlete && pl.athlete.id) || "");
        if (!aid) return;
        const st = {}; (pl.stats || []).forEach(x => { st[x.name] = n2(x.value); });
        mapa[aid] = {
          jugo: st.appearances > 0 || pl.starter === true,
          titular: pl.starter === true,
          goles: st.totalGoals || 0, asis: st.goalAssists || 0, ownGoals: st.ownGoals || 0,
          amarillas: st.yellowCards || 0, rojas: st.redCards || 0, saves: st.saves || 0,
          concedidosEquipo: concedidos
        };
      });
    });
  }));
  return mapa;
}

// Puntos fantasy de un jugador según su posición fija (del pool) y sus stats del partido.
function puntosJugador(pos, s) {
  if (!s || !s.jugo) return { pts: 0, detalle: [] };
  const det = [];
  let pts = s.titular ? 2 : 1; det.push([s.titular ? "Jugó de titular" : "Ingresó de cambio", pts]);
  const golVal = (pos === "POR" || pos === "DEF") ? 6 : (pos === "MED" ? 5 : 4);
  if (s.goles > 0) { const g = s.goles * golVal; pts += g; det.push([`${s.goles} gol${s.goles > 1 ? "es" : ""}`, g]); }
  if (s.asis > 0) { const a = s.asis * 3; pts += a; det.push([`${s.asis} asistencia${s.asis > 1 ? "s" : ""}`, a]); }
  if (s.titular && s.concedidosEquipo === 0) {
    if (pos === "POR" || pos === "DEF") { pts += 4; det.push(["Portería a cero", 4]); }
    else if (pos === "MED") { pts += 1; det.push(["Equipo sin goles en contra", 1]); }
  }
  if (pos === "POR" && s.saves >= 3) { const v = Math.floor(s.saves / 3); pts += v; det.push([`${s.saves} atajadas`, v]); }
  if ((pos === "POR" || pos === "DEF") && s.concedidosEquipo >= 2) { const c = -Math.floor(s.concedidosEquipo / 2); pts += c; det.push([`${s.concedidosEquipo} goles en contra`, c]); }
  if (s.ownGoals > 0) { const o = -2 * s.ownGoals; pts += o; det.push([`${s.ownGoals} autogol${s.ownGoals > 1 ? "es" : ""}`, o]); }
  if (s.amarillas > 0) { pts -= s.amarillas; det.push([`${s.amarillas} amarilla${s.amarillas > 1 ? "s" : ""}`, -s.amarillas]); }
  if (s.rojas > 0) { pts -= 3 * s.rojas; det.push(["Tarjeta roja", -3 * s.rojas]); }
  return { pts, detalle: det };
}

async function managerJornada(request, env) {
  const u = await usuarioDe(request, env);
  const ja = await jornadaActual();
  let miEquipo = null;
  if (u && ja.id) {
    const row = await env.cascarita.prepare(
      "SELECT jugadores, capitan FROM manager_equipos WHERE usuario_id = ? AND jornada = ?"
    ).bind(u.uid, ja.id).first();
    if (row) miEquipo = { jugadores: JSON.parse(row.jugadores || "[]"), capitan: row.capitan };
  }
  return json({ jornada: ja, miEquipo, presupuesto: PRESUPUESTO, tam: TAM_EQUIPO, maxPorEquipo: MAX_POR_EQUIPO });
}

async function managerGuardar(request, env) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  const d = await request.json().catch(() => null);
  if (!d || !Array.isArray(d.jugadores)) return json({ error: "datos inválidos" }, 400);
  const ja = await jornadaActual();
  if (!ja.id) return json({ error: "no hay jornada disponible" }, 400);
  if (!ja.abierta) return json({ error: "la jornada ya cerró, ya no puedes cambiar tu equipo" }, 400);

  const ids = [...new Set(d.jugadores.map(String))];
  if (ids.length !== TAM_EQUIPO) return json({ error: `elige exactamente ${TAM_EQUIPO} jugadores` }, 400);
  let costo = 0, porteros = 0; const porEquipo = {};
  for (const id of ids) {
    const meta = POOL[id];
    if (!meta) return json({ error: "hay un jugador inválido en tu equipo" }, 400);
    costo += meta.precio;
    porEquipo[meta.abbr] = (porEquipo[meta.abbr] || 0) + 1;
    if (meta.pos === "POR") porteros++;
  }
  if (costo > PRESUPUESTO + 1e-9) return json({ error: "te pasaste del presupuesto" }, 400);
  if (porteros !== 1) return json({ error: "tu equipo necesita exactamente 1 portero" }, 400);
  if (Object.values(porEquipo).some(x => x > MAX_POR_EQUIPO)) return json({ error: `máximo ${MAX_POR_EQUIPO} jugadores por equipo` }, 400);
  const capitan = String(d.capitan || "");
  if (!ids.includes(capitan)) return json({ error: "el capitán debe estar en tu equipo" }, 400);

  await env.cascarita.prepare(
    `INSERT INTO manager_equipos (usuario_id, jornada, jugadores, capitan, actualizado)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(usuario_id, jornada) DO UPDATE SET jugadores = excluded.jugadores, capitan = excluded.capitan, actualizado = CURRENT_TIMESTAMP`
  ).bind(u.uid, ja.id, JSON.stringify(ids), capitan).run();
  return json({ ok: true, jornada: ja.id });
}

// Puntúa un equipo (array de ids + capitán) contra el mapa de stats de la jornada.
function puntuarEquipo(ids, capitan, mapa) {
  let total = 0; const detalle = [];
  ids.forEach(id => {
    const meta = POOL[id];
    if (!meta) return;
    const r = puntosJugador(meta.pos, mapa[id]);
    const esCap = id === capitan;
    const pts = esCap ? r.pts * 2 : r.pts;
    total += pts;
    detalle.push({ id, pts, capitan: esCap });
  });
  return { total, detalle };
}

async function managerTabla(request, env, jornadaId) {
  const u = await usuarioDe(request, env);
  const ja = await jornadaActual();
  jornadaId = /^\d{8}$/.test(jornadaId || "") ? jornadaId : ja.id;
  if (!jornadaId) return json({ jornada: null, top: [], miRank: null, miDetalle: null, jugadores: 0 });

  const mapa = await statsJornada(jornadaId);
  const rows = (await env.cascarita.prepare(
    `SELECT e.usuario_id AS id, e.jugadores AS jugadores, e.capitan AS capitan, us.nombre AS nombre, us.avatar AS avatar
       FROM manager_equipos e JOIN usuarios us ON us.id = e.usuario_id
      WHERE e.jornada = ? AND COALESCE(us.oculto, 0) = 0`
  ).bind(jornadaId).all()).results || [];

  const tabla = rows.map(r => {
    const ids = JSON.parse(r.jugadores || "[]");
    const { total } = puntuarEquipo(ids, r.capitan, mapa);
    return { id: r.id, nombre: r.nombre, avatar: r.avatar, puntos: total };
  }).sort((x, y) => y.puntos - x.puntos);

  let miRank = null, miDetalle = null;
  if (u) {
    const idx = tabla.findIndex(t => t.id === u.uid);
    if (idx >= 0) miRank = { pos: idx + 1, puntos: tabla[idx].puntos, de: tabla.length };
    const yo = rows.find(r => r.id === u.uid);
    if (yo) miDetalle = puntuarEquipo(JSON.parse(yo.jugadores || "[]"), yo.capitan, mapa).detalle;
  }
  const top = tabla.slice(0, 20).map((t, i) => ({ pos: i + 1, nombre: t.nombre, avatar: t.avatar, puntos: t.puntos }));
  return json({ jornada: jornadaId, nombre: ja.id === jornadaId ? ja.nombre : jornadaId, top, miRank, miDetalle, jugadores: tabla.length });
}

async function managerGrupo(request, env, codigo, jornadaId) {
  const u = await usuarioDe(request, env);
  if (!u) return json({ error: "no autenticado" }, 401);
  codigo = String(codigo || "").toUpperCase();
  const g = await env.cascarita.prepare("SELECT codigo, nombre FROM grupos WHERE codigo = ?").bind(codigo).first();
  if (!g) return json({ error: "grupo no encontrado" }, 404);
  const ja = await jornadaActual();
  jornadaId = /^\d{8}$/.test(jornadaId || "") ? jornadaId : ja.id;
  if (!jornadaId) return json({ codigo: g.codigo, nombre: g.nombre, tabla: [] });

  const miembros = (await env.cascarita.prepare(
    `SELECT u.id AS id, u.nombre AS nombre, u.avatar AS avatar
       FROM grupo_miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.codigo = ? AND COALESCE(u.oculto, 0) = 0`
  ).bind(codigo).all()).results || [];
  const ids = miembros.map(m => m.id);
  let equipos = [];
  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    equipos = (await env.cascarita.prepare(
      `SELECT usuario_id AS id, jugadores, capitan FROM manager_equipos WHERE jornada = ? AND usuario_id IN (${ph})`
    ).bind(jornadaId, ...ids).all()).results || [];
  }
  const mapa = equipos.length ? await statsJornada(jornadaId) : {};
  const puntosDe = {};
  equipos.forEach(e => { puntosDe[e.id] = puntuarEquipo(JSON.parse(e.jugadores || "[]"), e.capitan, mapa).total; });
  const tabla = miembros.map(m => ({ nombre: m.nombre, avatar: m.avatar, puntos: puntosDe[m.id] != null ? puntosDe[m.id] : null }))
    .sort((a, b) => (b.puntos || -1) - (a.puntos || -1));
  return json({ codigo: g.codigo, nombre: g.nombre, jornada: jornadaId, tabla });
}

// Solo para pruebas (wrangler ignora exports extra del Worker).
export const __test = { puntosJugador, puntuarEquipo, statsJornada, jornadaActual, eventosDeJornada, aceptarToques };
