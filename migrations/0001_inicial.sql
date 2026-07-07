-- Cascarita — esquema inicial (usuarios + resultados de juegos)

CREATE TABLE IF NOT EXISTS usuarios (
  id      TEXT PRIMARY KEY,   -- "g:<google_sub>"
  email   TEXT,
  nombre  TEXT NOT NULL,
  avatar  TEXT,
  creado  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Un resultado por usuario/juego/día (idempotente: se re-guarda si vuelve a terminar).
CREATE TABLE IF NOT EXISTS resultados (
  usuario_id TEXT NOT NULL,
  juego      TEXT NOT NULL,   -- wordle | trivia | mayoromenor | banderas
  fecha      TEXT NOT NULL,   -- YYYY-MM-DD (día local del cliente)
  dia        INTEGER NOT NULL,-- numeroDia (para rachas)
  puntaje    INTEGER NOT NULL,-- puntos del día (según el juego)
  gano       INTEGER DEFAULT 0,
  creado     TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, juego, fecha),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resultados_juego ON resultados(juego, puntaje);
CREATE INDEX IF NOT EXISTS idx_resultados_usuario ON resultados(usuario_id);
