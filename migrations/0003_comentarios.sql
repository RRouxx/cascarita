-- Cascarita — comentarios (para "Maneja y escucha" y a futuro otros lugares)

CREATE TABLE IF NOT EXISTS comentarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  seccion    TEXT NOT NULL,          -- ej. "maneja:cdmx"
  usuario_id TEXT NOT NULL,
  texto      TEXT NOT NULL,
  creado     TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comentarios_seccion ON comentarios(seccion, id);
