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
    "El Salvador":{es:"El Salvador",iso:"SV"}, "Jamaica":{es:"Jamaica",iso:"JM"},
    // Europa (para el modo Global de 5 grandes ligas)
    "Scotland":{es:"Escocia",iso:""}, "Wales":{es:"Gales",iso:""}, "Northern Ireland":{es:"Irlanda del Norte",iso:""},
    "Ireland":{es:"Irlanda",iso:"IE"}, "Republic of Ireland":{es:"Irlanda",iso:"IE"},
    "Belgium":{es:"Bélgica",iso:"BE"}, "Bosnia and Herzegovina":{es:"Bosnia",iso:"BA"},
    "Albania":{es:"Albania",iso:"AL"}, "Kosovo":{es:"Kosovo",iso:"XK"},
    "North Macedonia":{es:"Macedonia del Norte",iso:"MK"}, "Slovenia":{es:"Eslovenia",iso:"SI"},
    "Slovakia":{es:"Eslovaquia",iso:"SK"}, "Czech Republic":{es:"Chequia",iso:"CZ"}, "Czechia":{es:"Chequia",iso:"CZ"},
    "Ukraine":{es:"Ucrania",iso:"UA"}, "Russia":{es:"Rusia",iso:"RU"}, "Hungary":{es:"Hungría",iso:"HU"},
    "Romania":{es:"Rumania",iso:"RO"}, "Bulgaria":{es:"Bulgaria",iso:"BG"}, "Greece":{es:"Grecia",iso:"GR"},
    "Turkey":{es:"Turquía",iso:"TR"}, "Türkiye":{es:"Turquía",iso:"TR"}, "Denmark":{es:"Dinamarca",iso:"DK"},
    "Sweden":{es:"Suecia",iso:"SE"}, "Norway":{es:"Noruega",iso:"NO"}, "Finland":{es:"Finlandia",iso:"FI"},
    "Iceland":{es:"Islandia",iso:"IS"}, "Austria":{es:"Austria",iso:"AT"}, "Switzerland":{es:"Suiza",iso:"CH"},
    "Georgia":{es:"Georgia",iso:"GE"}, "Armenia":{es:"Armenia",iso:"AM"}, "Azerbaijan":{es:"Azerbaiyán",iso:"AZ"},
    "Kazakhstan":{es:"Kazajistán",iso:"KZ"}, "Israel":{es:"Israel",iso:"IL"},
    "Moldova":{es:"Moldavia",iso:"MD"}, "Belarus":{es:"Bielorrusia",iso:"BY"},
    "Lithuania":{es:"Lituania",iso:"LT"}, "Latvia":{es:"Letonia",iso:"LV"}, "Estonia":{es:"Estonia",iso:"EE"},
    "Luxembourg":{es:"Luxemburgo",iso:"LU"}, "Malta":{es:"Malta",iso:"MT"}, "Cyprus":{es:"Chipre",iso:"CY"},
    // África
    "Algeria":{es:"Argelia",iso:"DZ"}, "Tunisia":{es:"Túnez",iso:"TN"}, "Egypt":{es:"Egipto",iso:"EG"},
    "Mali":{es:"Malí",iso:"ML"}, "Burkina Faso":{es:"Burkina Faso",iso:"BF"}, "Guinea":{es:"Guinea",iso:"GN"},
    "Guinea-Bissau":{es:"Guinea-Bisáu",iso:"GW"}, "Gambia":{es:"Gambia",iso:"GM"},
    "DR Congo":{es:"RD del Congo",iso:"CD"}, "Congo DR":{es:"RD del Congo",iso:"CD"}, "Congo":{es:"Congo",iso:"CG"},
    "Angola":{es:"Angola",iso:"AO"}, "Mozambique":{es:"Mozambique",iso:"MZ"}, "Zambia":{es:"Zambia",iso:"ZM"},
    "Zimbabwe":{es:"Zimbabue",iso:"ZW"}, "South Africa":{es:"Sudáfrica",iso:"ZA"}, "Togo":{es:"Togo",iso:"TG"},
    "Benin":{es:"Benín",iso:"BJ"}, "Gabon":{es:"Gabón",iso:"GA"}, "Equatorial Guinea":{es:"Guinea Ecuatorial",iso:"GQ"},
    "Central African Republic":{es:"Rep. Centroafricana",iso:"CF"}, "Kenya":{es:"Kenia",iso:"KE"},
    "Tanzania":{es:"Tanzania",iso:"TZ"}, "Uganda":{es:"Uganda",iso:"UG"}, "Ethiopia":{es:"Etiopía",iso:"ET"},
    "Libya":{es:"Libia",iso:"LY"}, "Mauritania":{es:"Mauritania",iso:"MR"}, "Niger":{es:"Níger",iso:"NE"},
    "Sierra Leone":{es:"Sierra Leona",iso:"SL"}, "Liberia":{es:"Liberia",iso:"LR"},
    "Madagascar":{es:"Madagascar",iso:"MG"}, "Comoros":{es:"Comoras",iso:"KM"}, "Burundi":{es:"Burundi",iso:"BI"},
    // Asia, Oceanía y Caribe
    "Japan":{es:"Japón",iso:"JP"}, "South Korea":{es:"Corea del Sur",iso:"KR"}, "Korea Republic":{es:"Corea del Sur",iso:"KR"},
    "China PR":{es:"China",iso:"CN"}, "Australia":{es:"Australia",iso:"AU"}, "New Zealand":{es:"Nueva Zelanda",iso:"NZ"},
    "Iran":{es:"Irán",iso:"IR"}, "Iraq":{es:"Irak",iso:"IQ"}, "Saudi Arabia":{es:"Arabia Saudita",iso:"SA"},
    "Uzbekistan":{es:"Uzbekistán",iso:"UZ"}, "Jordan":{es:"Jordania",iso:"JO"}, "Syria":{es:"Siria",iso:"SY"},
    "Lebanon":{es:"Líbano",iso:"LB"}, "Philippines":{es:"Filipinas",iso:"PH"}, "Indonesia":{es:"Indonesia",iso:"ID"},
    "Thailand":{es:"Tailandia",iso:"TH"}, "India":{es:"India",iso:"IN"},
    "Suriname":{es:"Surinam",iso:"SR"}, "Curacao":{es:"Curazao",iso:"CW"}, "Haiti":{es:"Haití",iso:"HT"},
    "French Guiana":{es:"Guayana Francesa",iso:""}, "Guadeloupe":{es:"Guadalupe",iso:""}
  };
  function paisES(nac) { const p = PAISES_INFO[nac]; return p ? p.es : (nac || ""); }
  function bandera(nac) {
    const p = PAISES_INFO[nac];
    if (!p || !p.iso || p.iso.length !== 2) return ""; // Escocia/Gales/etc no tienen emoji ISO
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

  // Número compacto para el ranking de Toques (1.23 M)
  function fmtCompacto(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(Math.floor(n));
    const u = ["K", "M", "B", "T", "Q"]; let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)) + " " + u[i];
  }

  // ---- Modal de ranking (todos los juegos con tabla) ----
  const RK_JUEGOS = [
    ["wordle", "¿Quién es?"], ["trivia", "Trivia"], ["mayoromenor", "Mayor o menor"],
    ["costomas", "¿Quién costó más?"], ["banderas", "Banderas"], ["escudos", "Escudos"],
    ["trayectoria", "Trayectoria"], ["memorama", "Memorama"], ["penales", "Penales"],
    ["atajadas", "Atajadas"], ["tiro", "Tiro al Ángulo"], ["contragolpe", "Contragolpe"],
    ["vitrina", "Vitrina"], ["draft", "Draft"], ["toques", "Toques 👟"]
  ];
  function rkFila(f, i, valor) {
    return `<div class="rk-fila"><span class="rk-pos">${i + 1}</span>` +
      (f.avatar ? `<img src="${f.avatar}" alt="" referrerpolicy="no-referrer">` : `<span class="rk-ini">${(f.nombre || "?").charAt(0)}</span>`) +
      `<span class="rk-nom">${f.nombre || "Jugador"}</span><span class="rk-pts">${valor}</span></div>`;
  }
  async function abrirRanking(juego) {
    const actual = juego || "wordle";
    let overlay = document.getElementById("ranking-overlay");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "ranking-overlay"; overlay.className = "rk-overlay";
      overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="rk-caja">
      <div class="rk-top"><b>🏆 Ranking</b><button class="rk-cerrar" aria-label="Cerrar">✕</button></div>
      <div class="rk-tabs">${RK_JUEGOS.map(j => `<button class="rk-tab${j[0] === actual ? " on" : ""}" data-j="${j[0]}">${j[1]}</button>`).join("")}</div>
      <div class="rk-lista" id="rk-lista">Cargando…</div>
    </div>`;
    overlay.querySelector(".rk-cerrar").addEventListener("click", () => overlay.remove());
    overlay.querySelectorAll(".rk-tab").forEach(t => t.addEventListener("click", () => abrirRanking(t.dataset.j)));
    const lista = overlay.querySelector("#rk-lista");
    try {
      if (actual === "toques") {
        const r = await api("/api/toques/ranking");
        const filas = r.tabla || [];
        if (!filas.length) { lista.innerHTML = "<div class='rk-vacio'>Aún no hay nadie. ¡Sé el primero!</div>"; return; }
        lista.innerHTML = filas.map((f, i) => rkFila(f, i, fmtCompacto(f.mejor) + (f.estrellas > 0 ? ` <span style="color:#eab308">⭐${f.estrellas}</span>` : ""))).join("");
      } else {
        const r = await ranking(actual);
        const filas = r.tabla || [];
        if (!filas.length) { lista.innerHTML = "<div class='rk-vacio'>Aún no hay resultados. ¡Sé el primero!</div>"; return; }
        lista.innerHTML = filas.map((f, i) => rkFila(f, i, f.puntos || 0)).join("");
      }
    } catch (e) {
      lista.innerHTML = "<div class='rk-vacio'>No se pudo cargar el ranking.</div>";
    }
  }

  // Compartir reutilizable: modal con botones de redes (lo usan los juegos)
  function compartir(texto, url) {
    const eTxt = encodeURIComponent(texto);
    const eUrl = encodeURIComponent(url || "");
    const full = url ? (texto + "\n" + url) : texto;
    const eFull = encodeURIComponent(full);
    let ov = document.getElementById("cx-share");
    if (!ov) { ov = document.createElement("div"); ov.id = "cx-share"; ov.className = "cx-ov"; ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); }); document.body.appendChild(ov); }
    ov.innerHTML =
      '<div class="cx-caja"><div class="cx-top"><b>📤 Compartir</b><button class="cx-x" aria-label="Cerrar">✕</button></div>' +
      '<div class="cx-body"><div class="cx-grid">' +
        '<a class="cx-btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + eFull + '">WhatsApp</a>' +
        '<a class="cx-btn tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + eUrl + '&text=' + eTxt + '">Telegram</a>' +
        '<a class="cx-btn xx" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + eFull + '">X</a>' +
        (url ? '<a class="cx-btn fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + eUrl + '">Facebook</a>' : '') +
      '</div>' +
      '<button class="cx-btn cx-copiar">📋 Copiar</button>' +
      '<button class="cx-btn cx-mas">📲 Más…</button>' +
      '</div></div>';
    ov.querySelector(".cx-x").addEventListener("click", () => ov.remove());
    ov.querySelector(".cx-copiar").addEventListener("click", async e => { const ok = await copiar(full); e.target.textContent = ok ? "✅ Copiado" : "No se pudo"; });
    const mas = ov.querySelector(".cx-mas");
    if (navigator.share) { mas.addEventListener("click", () => { navigator.share({ text: texto, url: url || undefined }).catch(() => {}); }); }
    else { mas.style.display = "none"; }
  }

  // Copyright en el pie de todas las páginas
  function agregarCopyright() {
    document.querySelectorAll(".pie").forEach(pie => {
      if (pie.querySelector(".copyright")) return;
      const c = document.createElement("div");
      c.className = "copyright";
      c.style.cssText = "margin-top:10px; font-size:.75rem; opacity:.65;";
      c.innerHTML = '© 2026 RRoux · <a href="/acerca/" style="color:inherit">Acerca de</a> · <a href="/contacto/" style="color:inherit">Contacto</a> · <a href="/privacidad/" style="color:inherit">Privacidad</a>';
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
    guardarResultado, ranking, abrirRanking, salir, alCambiarSesion, compartir
  };
})();
