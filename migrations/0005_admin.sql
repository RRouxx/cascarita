-- Cascarita — moderación: bandera para ocultar usuarios de los rankings.
-- oculto = 1  -> no aparece en ninguna tabla/ranking (reversible desde /admin).

ALTER TABLE usuarios ADD COLUMN oculto INTEGER DEFAULT 0;
