-- Cascarita — Quiniela de grupos (pick'em Liga MX)

CREATE TABLE IF NOT EXISTS grupos (
  codigo     TEXT PRIMARY KEY,        -- 6 caracteres
  nombre     TEXT NOT NULL,
  creador_id TEXT NOT NULL,
  creado     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grupo_miembros (
  codigo     TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  unido      TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (codigo, usuario_id),
  FOREIGN KEY (codigo) REFERENCES grupos(codigo) ON DELETE CASCADE
);

-- Una predicción por usuario/partido (vale para todos sus grupos).
CREATE TABLE IF NOT EXISTS predicciones (
  usuario_id TEXT NOT NULL,
  evento     TEXT NOT NULL,           -- id del partido en ESPN
  fecha      TEXT NOT NULL,           -- YYYY-MM-DD del partido (para acotar resultados)
  pred       TEXT NOT NULL,           -- 'L' | 'E' | 'V'
  creado     TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, evento),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pred_evento ON predicciones(evento);
CREATE INDEX IF NOT EXISTS idx_miembros_usuario ON grupo_miembros(usuario_id);
