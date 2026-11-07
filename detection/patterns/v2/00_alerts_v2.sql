-- =============================================================================
-- AJUSTE v2 (07-11-2026). Copia de la version v1 con los cambios marcados «v2:».
-- Se mide aparte, como antes/despues frente a la verdad conocida
-- (detection/evaluation/v2_evaluacion.sql). Las vistas y cifras oficiales v1 no cambian.
-- Las alertas son tfg.alerts_v2 = tfg.alerts ∪ tfg.alerts_kw (alertas que solo aparecen con la
-- semantica corregida de las palabras clave; detection/evaluation/v2_palabras_clave.py).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tfg.alerts_kw AS tfg.alerts;

CREATE OR REPLACE VIEW tfg.alerts_v2 AS
SELECT * FROM tfg.alerts FINAL
UNION ALL
SELECT * FROM tfg.alerts_kw FINAL;
