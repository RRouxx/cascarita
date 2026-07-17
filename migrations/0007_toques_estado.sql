-- La carrera de Toques viaja con la CUENTA (reporte de usuario 2026-07-16:
-- "el progreso de inactivo se guarda en el dispositivo y no en la cuenta").
-- Guardamos el estado COMPLETO del juego (JSON crudo) junto al ranking; el
-- ranking sigue leyendo `mejor` (validado por aceptarToques) — el blob es
-- continuidad entre dispositivos, no autoridad del ranking.
ALTER TABLE toques_ranking ADD COLUMN estado TEXT;
