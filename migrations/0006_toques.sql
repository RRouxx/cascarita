-- Cascarita — ranking de Toques (idle). Un valor acumulado de por vida por usuario.
-- Como el juego es 100% del cliente, el servidor guarda el mejor valor VALIDADO
-- (con tope de salto por tiempo real) y el ranking se lee de aquí, no del cliente.

CREATE TABLE IF NOT EXISTS toques_ranking (
  usuario_id     TEXT PRIMARY KEY,
  mejor          REAL NOT NULL DEFAULT 0,   -- toques de por vida validados
  estrellas      INTEGER NOT NULL DEFAULT 0,
  primer_ms      INTEGER NOT NULL,          -- epoch ms de la 1ª sincronización
  actualizado_ms INTEGER NOT NULL,          -- epoch ms de la última
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_toques_mejor ON toques_ranking(mejor);
