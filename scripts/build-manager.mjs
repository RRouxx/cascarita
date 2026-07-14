/* ============================================================
   Cascarita — genera el POOL del Mini-manager semanal.
   Lee data/jugadores.js (window.CASCARITA_DATA) y produce:
     - data/manager-pool.js  (cliente: window.CASCARITA_MANAGER, con todo lo del picker)
     - src/manager-pool.js    (servidor/Worker: export const POOL = { id: {abbr,pos,precio} })
   El PRECIO se deriva de las stats de la última temporada como proxy de calidad,
   y es la MISMA fórmula en ambos lados (aquí es la fuente de verdad) para que el
   presupuesto que ve el usuario cuadre con lo que valida el servidor.
   Uso:  node scripts/build-manager.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(RAIZ, "data", "jugadores.js"), "utf8");
// data/jugadores.js es `window.CASCARITA_DATA = {...};` — lo evaluamos aislado.
const CASCARITA_DATA = (() => {
  const sandbox = {};
  const fn = new Function("window", src + "\nreturn window.CASCARITA_DATA;");
  return fn(sandbox);
})();

const num = v => (typeof v === "number" && isFinite(v)) ? v : 0;
const POS_VALIDAS = new Set(["POR", "DEF", "MED", "DEL"]);

// Peso del gol por posición: que un defensa/portero goleador valga más (es raro y decisivo).
const PESO_GOL = { DEL: 0.7, MED: 1.0, DEF: 1.7, POR: 2.5 };

function precioDe(j) {
  const pos = j.pos;
  const goles = num(j.goles);
  const partidos = num(j.partidos);
  const titular = j.titular ? 1 : 0;
  let p = 3.5 + goles * (PESO_GOL[pos] || 1.0) + titular * 1.0 + Math.min(partidos, 17) * 0.12;
  p = Math.round(p * 2) / 2;              // a media unidad
  return Math.max(3.5, Math.min(15, p));  // techo/piso
}

const jugadores = (CASCARITA_DATA.jugadores || []).filter(j => POS_VALIDAS.has(j.pos));

const cliente = jugadores.map(j => ({
  id: String(j.id),
  nombre: j.nombre,
  equipo: j.equipo,
  abbr: j.abbr,
  pos: j.pos,
  nac: j.nac || "",
  edad: j.edad || null,
  goles: num(j.goles),
  partidos: num(j.partidos),
  precio: precioDe(j)
})).sort((a, b) => b.precio - a.precio || a.nombre.localeCompare(b.nombre));

// ---- Salida cliente ----
const salidaCliente =
`/* Generado por scripts/build-manager.mjs — NO editar a mano.
   Pool del Mini-manager semanal. Precio = proxy de calidad (stats última temporada). */
window.CASCARITA_MANAGER = {
  fuente: ${JSON.stringify(CASCARITA_DATA.fuente || "ESPN")},
  actualizado: ${JSON.stringify(CASCARITA_DATA.actualizado || "")},
  temporadaStats: "Clausura 2025 (proxy de calidad para el precio)",
  jugadores: ${JSON.stringify(cliente)}
};
`;
fs.writeFileSync(path.join(RAIZ, "data", "manager-pool.js"), salidaCliente);

// ---- Salida servidor (ES module, compacto) ----
const mapa = {};
for (const j of cliente) mapa[j.id] = { abbr: j.abbr, pos: j.pos, precio: j.precio };
const salidaServidor =
`// Generado por scripts/build-manager.mjs — NO editar a mano.
// Pool compacto para validar equipos en el Worker (id -> {abbr,pos,precio}).
export const POOL = ${JSON.stringify(mapa)};
export const PRESUPUESTO = 45;
export const TAM_EQUIPO = 5;
export const MAX_POR_EQUIPO = 2;
`;
fs.writeFileSync(path.join(RAIZ, "src", "manager-pool.js"), salidaServidor);

// ---- Reporte de distribución (para calibrar presupuesto) ----
const precios = cliente.map(j => j.precio).sort((a, b) => b - a);
const top = cliente.slice(0, 10).map(j => `${j.precio}  ${j.nombre} (${j.abbr} ${j.pos}, ${j.goles}g)`);
console.log(`Jugadores en el pool: ${cliente.length}`);
console.log(`Precio máx ${precios[0]}  ·  mediana ${precios[Math.floor(precios.length/2)]}  ·  mín ${precios[precios.length-1]}`);
console.log(`Top-5 más caros suman: ${precios.slice(0,5).reduce((a,b)=>a+b,0)}  (presupuesto = 45)`);
console.log("Top 10 por precio:\n  " + top.join("\n  "));
