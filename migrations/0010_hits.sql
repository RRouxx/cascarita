-- Analítica anónima y agregada para medir crecimiento SIN login.
-- 1 fila por (día CDMX, visitante anónimo, juego). El "cid" es un id aleatorio
-- del navegador, sin datos personales y sin cruzarse con cuentas. Sirve para
-- contar visitantes, jugadores y retención de la gente que NO inicia sesión
-- (que es la mayoría). Los juegos siguen 100% jugables sin registro.
CREATE TABLE IF NOT EXISTS hits (
  dia      TEXT    NOT NULL,               -- YYYY-MM-DD (día del aficionado, CDMX)
  cid      TEXT    NOT NULL,               -- id anónimo del navegador
  juego    TEXT    NOT NULL DEFAULT 'portada',
  jugo     INTEGER NOT NULL DEFAULT 0,     -- 1 si completó un juego ese día
  visto_ms INTEGER NOT NULL,
  PRIMARY KEY (dia, cid, juego)
);
CREATE INDEX IF NOT EXISTS idx_hits_dia ON hits (dia);
