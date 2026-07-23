-- 0008: suscripciones Web Push (avisos del día). Una fila por dispositivo/navegador.
-- endpoint = clave (único por suscripción). usuario opcional (se puede activar sin login).
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  usuario    TEXT,
  creado_ms  INTEGER,
  fallos     INTEGER DEFAULT 0
);
