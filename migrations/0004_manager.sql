-- Cascarita — Mini-manager semanal (fantasy por jornada).
-- Un equipo (quinteto) por usuario y por jornada. La jornada se identifica por la
-- fecha del primer partido (YYYYMMDD); los puntos se calculan en vivo desde ESPN.

CREATE TABLE IF NOT EXISTS manager_equipos (
  usuario_id TEXT NOT NULL,
  jornada    TEXT NOT NULL,           -- "YYYYMMDD" del primer partido de la jornada
  jugadores  TEXT NOT NULL,           -- JSON: array de ids de jugador (ESPN)
  capitan    TEXT NOT NULL,           -- id del capitán (puntos x2)
  formacion  TEXT,                    -- etiqueta informativa (p. ej. "1-4")
  creado     TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizado TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, jornada),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manager_jornada ON manager_equipos(jornada);
