// Web Push desde el Worker (VAPID + aes128gcm, RFC 8291/8188) — sin librerías, Web Crypto puro.
// Llaves VAPID: env.VAPID_PUBLIC (base64url del punto sin comprimir, 65 bytes), env.VAPID_PRIVATE
// (base64url del escalar d, 32 bytes), env.VAPID_SUBJECT (mailto:...). El público NO es secreto.

// ---- base64url <-> bytes ----
export function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
export function bytesToB64u(b) {
  b = new Uint8Array(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs) {
  let n = 0; arrs.forEach(a => n += a.length);
  const out = new Uint8Array(n); let o = 0;
  arrs.forEach(a => { out.set(a, o); o += a.length; });
  return out;
}
const enc = new TextEncoder();

async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
// HKDF con salida <=32 (un bloque): HKDF-Expand(HKDF-Extract(salt,ikm), info, len).
async function hkdf(salt, ikm, info, len) {
  const prk = await hmac(salt, ikm);
  const out = await hmac(prk, concat(info, new Uint8Array([1])));
  return out.slice(0, len);
}

// ---- VAPID JWT (ES256) ----
async function importVapid(privB64u, pubB64u) {
  const pub = b64uToBytes(pubB64u); // 0x04 || X(32) || Y(32)
  const jwk = {
    kty: "EC", crv: "P-256", d: privB64u,
    x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
export async function vapidJwt(env, aud, ahora) {
  const now = Math.floor((ahora || Date.now()) / 1000);
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64u(enc.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:pks_atlas@hotmail.com" })));
  const signingInput = header + "." + payload;
  const key = await importVapid(env.VAPID_PRIVATE, env.VAPID_PUBLIC);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  return signingInput + "." + bytesToB64u(sig);
}

// ---- Cifrado del payload (RFC 8291 aes128gcm) ----
// `test` (opcional) permite inyectar la efímera+salt para validar contra el vector del RFC.
export async function cifrarPayload(sub, payloadBytes, test) {
  const uaPublic = b64uToBytes(sub.keys.p256dh);   // 65 bytes
  const authSecret = b64uToBytes(sub.keys.auth);   // 16 bytes
  let asPrivateKey, asPublicRaw, salt;
  if (test) { asPrivateKey = test.asPrivateKey; asPublicRaw = test.asPublicRaw; salt = test.salt; }
  else {
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivateKey = kp.privateKey;
    asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    salt = crypto.getRandomValues(new Uint8Array(16));
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivateKey, 256));
  // IKM (RFC 8291): PRK_key = HMAC(auth, ecdh); key_info = "WebPush: info\0"||uaPub||asPub
  const prkKey = await hmac(authSecret, ecdh);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = (await hmac(prkKey, concat(keyInfo, new Uint8Array([1])))).slice(0, 32);
  // CEK y NONCE (RFC 8188 aes128gcm)
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  // registro único: payload || 0x02 (delimitador de último registro)
  const record = concat(payloadBytes, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record));
  // cabecera aes128gcm: salt(16) || rs(4 BE) || idlen(1) || keyid(asPublic 65)
  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]), new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concat(header, ct);
}

// ---- Envío ----
export async function enviarPush(env, sub, payloadObj) {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  const body = await cifrarPayload(sub, enc.encode(JSON.stringify(payloadObj)));
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": "vapid t=" + jwt + ", k=" + env.VAPID_PUBLIC,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
    },
    body,
  });
  return r.status; // 201 = enviado · 404/410 = suscripción muerta (borrar)
}

// Mensaje del día (rota para no cansar). numeroDia = entero del día.
export function mensajeDelDia(numeroDia) {
  const msgs = [
    { title: "⚽ Cascarita", body: "Ya salieron los retos de hoy — ¿mantienes tu racha?" },
    { title: "🎩 Tu club te espera", body: "En DT ganaste monedas mientras no estabas. Ven a recogerlas." },
    { title: "🔥 No pierdas la racha", body: "Un partido rápido y sigues encendido. Los juegos de hoy ya están." },
    { title: "🧠 ¿Quién es hoy?", body: "Nuevo futbolista misterioso en Cascarita. ¿En cuántos intentos?" },
    { title: "⚽ Cascarita", body: "Trivia, Conecta, DT y más — tus retos diarios te esperan." },
  ];
  return Object.assign({ url: "/", icon: "/icon-192.png" }, msgs[((numeroDia % msgs.length) + msgs.length) % msgs.length]);
}
