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

  if (p === "/api/config") return json({ googleClientId: env.GOOGLE_CLIENT_ID || "" });
  if (p === "/api/me") return me(request, env);
  if (p === "/api/auth/google" && m === "POST") return authGoogle(request, env);
  if (p === "/api/logout" && m === "POST") return logout();
  if (p === "/api/resultado" && m === "POST") return guardarResultado(request, env);
  if (p.startsWith("/api/ranking/")) return ranking(env, decodeURIComponent(p.slice("/api/ranking/".length)));

  return json({ error: "no encontrado" }, 404);
}

// ---------------- Utilidades HTTP ----------------
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
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
