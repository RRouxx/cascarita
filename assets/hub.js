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

  return {
    fechaHoy, numeroDia, xmur3, mulberry32, indiceDelDia, rngDelDia,
    cargar, guardar, normaliza, copiar, paisES, bandera
  };
})();
