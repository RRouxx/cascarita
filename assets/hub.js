/* ============================================================
   Cascarita — utilidades compartidas por todos los juegos
   - Reto "del día" determinista (todos ven el mismo cada día)
   - Rachas y estado en localStorage
   - Normalización de texto para búsquedas
   ============================================================ */

window.Cascarita = (function () {

  // Fecha local YYYY-MM-DD (el "día" corta a medianoche local, como Wordle)
  function fechaHoy() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  // Número de día desde el lanzamiento (para el "#123" al compartir)
  function numeroDia() {
    const epoca = Date.UTC(2026, 0, 1); // 1 ene 2026
    const h = new Date();
    const hoy = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.floor((hoy - epoca) / 86400000);
  }

  // Hash determinista de un string -> entero (xmur3)
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // PRNG determinista (mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Índice determinista del día en [0, n) para un juego dado
  function indiceDelDia(n, sufijo) {
    const semilla = xmur3(fechaHoy() + "|" + (sufijo || ""))();
    return mulberry32(semilla)() * n | 0;
  }

  // Generador de aleatorios del día (mismo stream para todos hoy). Úsalo para armar
  // retos deterministas con varias tiradas: const r = rngDelDia("trivia"); r(); r(); ...
  function rngDelDia(sufijo) {
    return mulberry32(xmur3(fechaHoy() + "|" + (sufijo || ""))());
  }

  // ---- Estado en localStorage (namespaced) ----
  function cargar(clave, porDefecto) {
    try {
      const v = localStorage.getItem("cascarita:" + clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem("cascarita:" + clave, JSON.stringify(valor)); }
    catch (e) { /* modo privado / lleno: se ignora */ }
  }

  // Quita acentos y baja a minúsculas (para autocompletar/buscar)
  function normaliza(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  // Copia texto al portapapeles con fallback
  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
      return ok;
    }
  }

  // Países (como los nombra ESPN, en inglés) -> nombre en español + ISO2 para la bandera
  const PAISES_INFO = {
    "Mexico":{es:"México",iso:"MX"}, "Argentina":{es:"Argentina",iso:"AR"},
    "Uruguay":{es:"Uruguay",iso:"UY"}, "Colombia":{es:"Colombia",iso:"CO"},
    "Brazil":{es:"Brasil",iso:"BR"}, "Spain":{es:"España",iso:"ES"},
    "USA":{es:"Estados Unidos",iso:"US"}, "United States":{es:"Estados Unidos",iso:"US"},
    "Ecuador":{es:"Ecuador",iso:"EC"}, "Venezuela":{es:"Venezuela",iso:"VE"},
    "Portugal":{es:"Portugal",iso:"PT"}, "France":{es:"Francia",iso:"FR"},
    "Chile":{es:"Chile",iso:"CL"}, "Paraguay":{es:"Paraguay",iso:"PY"},
    "Panama":{es:"Panamá",iso:"PA"}, "Morocco":{es:"Marruecos",iso:"MA"},
    "Canada":{es:"Canadá",iso:"CA"}, "Peru":{es:"Perú",iso:"PE"},
    "Costa Rica":{es:"Costa Rica",iso:"CR"}, "Cameroon":{es:"Camerún",iso:"CM"},
    "Senegal":{es:"Senegal",iso:"SN"}, "Italy":{es:"Italia",iso:"IT"},
    "Cape Verde Islands":{es:"Cabo Verde",iso:"CV"}, "Nigeria":{es:"Nigeria",iso:"NG"},
    "Guatemala":{es:"Guatemala",iso:"GT"}, "Montenegro":{es:"Montenegro",iso:"ME"},
    "Honduras":{es:"Honduras",iso:"HN"}, "Ghana":{es:"Ghana",iso:"GH"},
    "Netherlands":{es:"Países Bajos",iso:"NL"}, "Germany":{es:"Alemania",iso:"DE"},
    "England":{es:"Inglaterra",iso:"GB"}, "Croatia":{es:"Croacia",iso:"HR"},
    "Serbia":{es:"Serbia",iso:"RS"}, "Poland":{es:"Polonia",iso:"PL"},
    "Dominican Republic":{es:"Rep. Dominicana",iso:"DO"}, "Bolivia":{es:"Bolivia",iso:"BO"},
    "Ivory Coast":{es:"Costa de Marfil",iso:"CI"}, "Nicaragua":{es:"Nicaragua",iso:"NI"},
    "El Salvador":{es:"El Salvador",iso:"SV"}, "Jamaica":{es:"Jamaica",iso:"JM"}
  };
  function paisES(nac) { const p = PAISES_INFO[nac]; return p ? p.es : (nac || ""); }
  function bandera(nac) {
    const p = PAISES_INFO[nac];
    if (!p || !p.iso) return "";
    return String.fromCodePoint(...[...p.iso].map(c => 127397 + c.charCodeAt(0))) + " ";
  }

  // ============ Cuenta / login (OPCIONAL; degrada solo si no hay backend) ============
  const auth = { usuario: null, clientId: "", facebookAppId: "", fbReady: false, listos: false, subs: [] };

  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: "same-origin" }, opts)).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function apiPost(path, body) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }

  function alCambiarSesion(fn) { auth.subs.push(fn); if (auth.listos) fn(auth.usuario); }
  function notificarSesion() { auth.subs.forEach(fn => { try { fn(auth.usuario); } catch (e) {} }); }

  async function initAuth() {
    try {
      const cfg = await api("/api/config");
      auth.clientId = (cfg && cfg.googleClientId) || "";
      auth.facebookAppId = (cfg && cfg.facebookAppId) || "";
      const m = await api("/api/me");
      auth.usuario = (m && m.usuario) || null;
    } catch (e) {
      auth.clientId = ""; auth.facebookAppId = ""; auth.usuario = null; // sin backend: login off
    }
    auth.listos = true;
    montarWidget();
    notificarSesion();
    if (!auth.usuario) {
      if (auth.clientId) cargarGIS();
      if (auth.facebookAppId) cargarFB();
    }
  }

  function cargarGIS() {
    if (window.google && window.google.accounts && window.google.accounts.id) { initGIS(); montarWidget(); return; }
    if (document.getElementById("gis-sdk")) return;
    const s = document.createElement("script");
    s.id = "gis-sdk"; s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
    s.onload = () => { initGIS(); montarWidget(); };
    document.head.appendChild(s);
  }
  function initGIS() {
    if (!window.google || !window.google.accounts || !auth.clientId) return;
    window.google.accounts.id.initialize({
      client_id: auth.clientId,
      callback: async (resp) => {
        try {
          const r = await apiPost("/api/auth/google", { credential: resp.credential });
          auth.usuario = r.usuario; notificarSesion(); montarWidget();
        } catch (e) {}
      }
    });
  }

  function cargarFB() {
    if (!auth.facebookAppId) return;
    if (window.FB) { auth.fbReady = true; montarWidget(); return; }
    if (document.getElementById("fb-sdk")) return;
    window.fbAsyncInit = function () {
      window.FB.init({ appId: auth.facebookAppId, cookie: true, xfbml: false, version: "v19.0" });
      auth.fbReady = true; montarWidget();
    };
    const s = document.createElement("script");
    s.id = "fb-sdk"; s.async = true; s.defer = true; s.src = "https://connect.facebook.net/es_LA/sdk.js";
    document.head.appendChild(s);
  }
  function entrarFacebook() {
    if (!window.FB) return;
    window.FB.login(function (resp) {
      if (resp && resp.authResponse && resp.authResponse.accessToken) {
        apiPost("/api/auth/facebook", { token: resp.authResponse.accessToken })
          .then(r => { if (r && r.usuario) { auth.usuario = r.usuario; notificarSesion(); montarWidget(); } })
          .catch(() => {});
      }
    }, { scope: "public_profile" });
  }

  async function salir() {
    try { await apiPost("/api/logout"); } catch (e) {}
    auth.usuario = null; notificarSesion(); montarWidget();
    if (auth.clientId) cargarGIS();
  }

  // Los juegos llaman esto al terminar; si no hay login, no hace nada (las rachas locales siguen).
  async function guardarResultado(juego, datos) {
    if (!auth.usuario) return;
    try { await apiPost("/api/resultado", Object.assign({ juego: juego }, datos)); } catch (e) {}
  }
  function ranking(juego) { return api("/api/ranking/" + encodeURIComponent(juego)); }

  // ---- Widget en la barra ----
  function montarWidget() {
    const barra = document.querySelector(".barra");
    if (!barra) return;
    let cont = document.getElementById("cuenta");
    if (!cont) { cont = document.createElement("div"); cont.id = "cuenta"; cont.className = "cuenta"; barra.appendChild(cont); }
    cont.innerHTML = "";
    if (auth.listos && (auth.clientId || auth.facebookAppId)) {
      const tro = document.createElement("button");
      tro.className = "cta-icono"; tro.title = "Ranking"; tro.textContent = "🏆";
      tro.addEventListener("click", () => abrirRanking());
      cont.appendChild(tro);
    }
    if (auth.usuario) {
      const perfil = document.createElement("div"); perfil.className = "perfil";
      perfil.innerHTML =
        (auth.usuario.avatar ? `<img src="${auth.usuario.avatar}" alt="" referrerpolicy="no-referrer">` : `<span class="ini">${(auth.usuario.nombre || "?").charAt(0)}</span>`) +
        `<span class="nom">${auth.usuario.nombre || "Jugador"}</span>`;
      const salirBtn = document.createElement("button"); salirBtn.className = "cta-salir"; salirBtn.textContent = "Salir";
      salirBtn.addEventListener("click", salir);
      perfil.appendChild(salirBtn);
      cont.appendChild(perfil);
    } else {
      if (auth.clientId && window.google && window.google.accounts && window.google.accounts.id) {
        const btn = document.createElement("div"); btn.id = "gbtn"; cont.appendChild(btn);
        try { window.google.accounts.id.renderButton(btn, { theme: "filled_black", size: "medium", text: "signin", shape: "pill" }); } catch (e) {}
      }
      if (auth.facebookAppId && auth.fbReady) {
        const fb = document.createElement("button"); fb.className = "cta-fb"; fb.type = "button";
        fb.innerHTML = '<span class="fb-f">f</span> Facebook';
        fb.addEventListener("click", entrarFacebook);
        cont.appendChild(fb);
      }
    }
  }

  // ---- Modal de ranking ----
  async function abrirRanking(juego) {
    const juegos = [["wordle", "¿Quién es?"], ["trivia", "Trivia"], ["mayoromenor", "Mayor o menor"], ["banderas", "Banderas"]];
    const actual = juego || "wordle";
    let overlay = document.getElementById("ranking-overlay");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "ranking-overlay"; overlay.className = "rk-overlay";
      overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="rk-caja">
      <div class="rk-top"><b>🏆 Ranking</b><button class="rk-cerrar" aria-label="Cerrar">✕</button></div>
      <div class="rk-tabs">${juegos.map(j => `<button class="rk-tab${j[0] === actual ? " on" : ""}" data-j="${j[0]}">${j[1]}</button>`).join("")}</div>
      <div class="rk-lista" id="rk-lista">Cargando…</div>
    </div>`;
    overlay.querySelector(".rk-cerrar").addEventListener("click", () => overlay.remove());
    overlay.querySelectorAll(".rk-tab").forEach(t => t.addEventListener("click", () => abrirRanking(t.dataset.j)));
    const lista = overlay.querySelector("#rk-lista");
    try {
      const r = await ranking(actual);
      const filas = r.tabla || [];
      if (!filas.length) { lista.innerHTML = "<div class='rk-vacio'>Aún no hay resultados. ¡Sé el primero!</div>"; return; }
      lista.innerHTML = filas.map((f, i) =>
        `<div class="rk-fila"><span class="rk-pos">${i + 1}</span>` +
        (f.avatar ? `<img src="${f.avatar}" alt="" referrerpolicy="no-referrer">` : `<span class="rk-ini">${(f.nombre || "?").charAt(0)}</span>`) +
        `<span class="rk-nom">${f.nombre || "Jugador"}</span><span class="rk-pts">${f.puntos || 0}</span></div>`
      ).join("");
    } catch (e) {
      lista.innerHTML = "<div class='rk-vacio'>No se pudo cargar el ranking.</div>";
    }
  }

  // Copyright en el pie de todas las páginas
  function agregarCopyright() {
    document.querySelectorAll(".pie").forEach(pie => {
      if (pie.querySelector(".copyright")) return;
      const c = document.createElement("div");
      c.className = "copyright";
      c.style.cssText = "margin-top:10px; font-size:.75rem; opacity:.65;";
      c.textContent = "© 2026 RRoux";
      pie.appendChild(c);
    });
  }

  // Arranque (cuando el DOM esté listo)
  function arranque() { initAuth(); agregarCopyright(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arranque);
  else arranque();

  return {
    fechaHoy, numeroDia, xmur3, mulberry32, indiceDelDia, rngDelDia,
    cargar, guardar, normaliza, copiar, paisES, bandera,
    guardarResultado, ranking, abrirRanking, salir, alCambiarSesion
  };
})();
