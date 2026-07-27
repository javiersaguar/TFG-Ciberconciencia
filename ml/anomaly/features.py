"""Extraccion de caracteristicas para la deteccion de anomalias.

Dos niveles de agregacion:
  - por evento   : cada evento OCSF es una muestra
  - por ventana  : la actividad de un host durante N minutos es una muestra

El nivel de ventana es el principal, por su mejor encaje con la naturaleza
multi-etapa del problema; el de evento sirve como comparacion.
"""
import clickhouse_connect
import pandas as pd


def get_client(host="127.0.0.1", port=8123):
    return clickhouse_connect.get_client(
        host=host, port=port, username="tfg", password="tfg", database="tfg"
    )


# ---------------------------------------------------------------------------
# Nivel VENTANA
# ---------------------------------------------------------------------------

WINDOW_QUERY = """
SELECT
    dataset_id,
    device_hostname                                             AS host,
    toStartOfInterval(time, INTERVAL {minutes} MINUTE)          AS ventana,

    -- ABSOLUTAS: volumen y diversidad
    count()                                                     AS n_eventos,
    uniqExact(class_uid)                                        AS n_clases,
    uniqExact(actor_process_name)                               AS n_procesos_actor,
    uniqExact(target_process_name)                              AS n_procesos_destino,
    uniqExact(actor_user_name)                                  AS n_usuarios,
    uniqExact(file_path)                                        AS n_ficheros,
    uniqExactIf(dst_ip, isNotNull(dst_ip))                      AS n_ips_destino,
    uniqExactIf(dst_port, isNotNull(dst_port))                  AS n_puertos_destino,

    -- ABSOLUTAS: recuentos por tipo
    countIf(class_uid = 1007)                                   AS c_proceso,
    countIf(class_uid = 1001)                                   AS c_fichero,
    countIf(class_uid = 1005)                                   AS c_modulo,
    countIf(class_uid = 1009)                                   AS c_script,
    countIf(class_uid = 4001)                                   AS c_red,
    countIf(class_uid = 3002)                                   AS c_auth,
    countIf(class_uid = 3003)                                   AS c_privilegios,
    countIf(class_uid = 1008)                                   AS c_log_evento,
    countIf(activity_id = 1 AND class_uid = 1007)               AS c_lanzamientos,
    countIf(activity_id = 3 AND class_uid = 1007)               AS c_accesos,
    countIf(activity_id = 4 AND class_uid = 1007)               AS c_inyecciones,
    countIf(severity_id >= 3)                                   AS c_severidad_alta,

    -- ABSOLUTAS: senales precalculadas
    countIf(signal_lsass_access)                                AS s_lsass,
    countIf(signal_suspicious_access)                           AS s_lsass_sosp,
    countIf(signal_dump_module)                                 AS s_dump_mod,
    countIf(signal_dump_file)                                   AS s_dump_file,
    countIf(signal_log_cleared)                                 AS s_log_borrado,
    countIf(signal_remote_logon)                                AS s_logon_remoto,

    -- RELATIVAS: proporcion de cada tipo de actividad sobre el total.
    -- Independientes del volumen de la ventana por construccion.
    round(countIf(class_uid = 1007) / count(), 5)               AS r_proceso,
    round(countIf(class_uid = 1001) / count(), 5)               AS r_fichero,
    round(countIf(class_uid = 1005) / count(), 5)               AS r_modulo,
    round(countIf(class_uid = 1009) / count(), 5)               AS r_script,
    round(countIf(class_uid = 4001) / count(), 5)               AS r_red,
    round(countIf(class_uid = 3002) / count(), 5)               AS r_auth,
    round(countIf(class_uid = 3003) / count(), 5)               AS r_privilegios,
    round(countIf(class_uid = 1008) / count(), 5)               AS r_log_evento,
    round(countIf(activity_id = 1 AND class_uid = 1007) / count(), 5) AS r_lanzamientos,
    round(countIf(activity_id = 3 AND class_uid = 1007) / count(), 5) AS r_accesos,
    round(countIf(activity_id = 4 AND class_uid = 1007) / count(), 5) AS r_inyecciones,
    round(countIf(severity_id >= 3) / count(), 5)               AS r_severidad_alta,

    -- RELATIVAS: diversidad respecto al volumen
    round(uniqExact(actor_process_name) / count(), 5)           AS r_div_proc_actor,
    round(uniqExact(target_process_name) / count(), 5)          AS r_div_proc_dest,
    round(uniqExact(file_path) / count(), 5)                    AS r_div_ficheros,
    round(uniqExact(class_uid) / count(), 5)                    AS r_div_clases
FROM tfg.events_dedup
GROUP BY dataset_id, host, ventana
ORDER BY dataset_id, host, ventana
"""


def load_window_features(client, minutes=5):
    """Carga las caracteristicas agregadas por (dataset, host, ventana)."""
    df = client.query_df(WINDOW_QUERY.format(minutes=minutes))
    return df


def add_alert_labels(client, df, minutes=5):
    """Anade el numero de alertas Sigma de cada ventana, como referencia.

    IMPORTANTE: esta etiqueta NO se usa para entrenar (el modelo es no
    supervisado). Sirve unicamente para evaluar si lo que el modelo considera
    anomalo coincide con lo que las reglas detectan.
    """
    q = f"""
    SELECT dataset_id, device_hostname AS host,
           toStartOfInterval(time, INTERVAL {minutes} MINUTE) AS ventana,
           count() AS n_alertas,
           countIf(rule_level IN ('high','critical')) AS n_alertas_altas
    FROM tfg.alerts
    GROUP BY dataset_id, host, ventana
    """
    alerts = client.query_df(q)
    if alerts.empty:
        df["n_alertas"] = 0
        df["n_alertas_altas"] = 0
        return df
    out = df.merge(alerts, on=["dataset_id", "host", "ventana"], how="left")
    out["n_alertas"] = out["n_alertas"].fillna(0).astype(int)
    out["n_alertas_altas"] = out["n_alertas_altas"].fillna(0).astype(int)
    return out


# Columnas que NO son caracteristicas (identificadores o etiquetas)
NON_FEATURES = {"dataset_id", "host", "ventana", "n_alertas", "n_alertas_altas"}


def feature_columns(df):
    return [c for c in df.columns if c not in NON_FEATURES]

# Caracteristicas absolutas (dependen del volumen de la ventana)
def absolute_features(df):
    return [c for c in feature_columns(df)
            if c.startswith(("n_", "c_", "s_"))]


# Caracteristicas relativas (proporciones, independientes del volumen)
def relative_features(df):
    return [c for c in feature_columns(df) if c.startswith("r_")]