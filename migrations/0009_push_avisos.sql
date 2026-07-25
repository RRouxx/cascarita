-- 0009: dedup de avisos push disparados por cron (para no repetir el mismo día).
-- Ej.: (fecha='2026-07-25', tipo='quiniela') = ya se mandó el recordatorio de ese día.
CREATE TABLE IF NOT EXISTS push_avisos (
  fecha      TEXT NOT NULL,        -- día CDMX YYYY-MM-DD
  tipo       TEXT NOT NULL,        -- 'quiniela', etc.
  enviado_ms INTEGER,
  PRIMARY KEY (fecha, tipo)
);
