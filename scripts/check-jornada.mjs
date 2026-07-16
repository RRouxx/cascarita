// Chequeo de salud del Mini-manager contra la jornada REAL.
// Úsalo la noche del primer partido (o cualquier día de jornada):
//   node scripts/check-jornada.mjs            → jornada actual
//   node scripts/check-jornada.mjs 20260717   → jornada específica
// Reporta: partidos y su estado, cuántos jugadores de los box scores de
// ESPN están en el POOL del draft (si el % es bajo, toca reconstruir el
// pool con scripts/build-manager.mjs) y el top fantasy con la lógica real.
import { POOL } from "../src/manager-pool.js";
import { __test } from "../src/index.js";

const { statsJornada, jornadaActual, eventosDeJornada, puntosJugador } = __test;

const jId = process.argv[2] || (await jornadaActual()).id;
if (!jId) { console.log("Sin jornada a la vista."); process.exit(0); }

const eventos = await eventosDeJornada(jId);
console.log(`Jornada ${jId} — ${eventos.length} partidos`);
for (const ev of eventos) {
  console.log(`  · ${ev.fecha} ${ev.local} vs ${ev.visitante} — ${ev.estado}${ev.marcador ? " " + ev.marcador : ""}`);
}

const stats = await statsJornada(jId);
const ids = Object.keys(stats);
if (!ids.length) {
  console.log("\nAún sin box scores (ningún partido ha empezado). Corre esto de nuevo cuando ruede el balón.");
  process.exit(0);
}

const enPool = ids.filter(id => POOL[id]);
const pct = Math.round(enPool.length / ids.length * 100);
console.log(`\nBox scores: ${ids.length} jugadores vistos · ${enPool.length} en el pool (${pct}%)`);
console.log(pct >= 80 ? "✅ Cobertura sana: los drafts van a puntuar."
  : pct >= 60 ? "⚠️ Cobertura regular: hay fichajes fuera del pool — reconstruir con build-manager.mjs tras la jornada."
  : "❌ Cobertura baja: el pool está desactualizado — reconstruir YA con build-manager.mjs.");

const top = enPool
  .map(id => ({ id, ...POOL[id], ...puntosJugador(POOL[id].pos, stats[id]) }))
  .filter(x => x.pts > 0)
  .sort((a, b) => b.pts - a.pts)
  .slice(0, 10);
if (top.length) {
  console.log("\nTop fantasy (con la lógica real del juego):");
  top.forEach(x => console.log(`  ${String(x.pts).padStart(3)} pts · ${x.abbr} ${x.pos} · id ${x.id} · $${x.precio}`));
}
