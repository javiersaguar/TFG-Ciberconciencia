"""Genera verdad propuesta y SQL CEP aislado, sin conectar con servicios.

El SQL de los patrones se conserva: solo cambian propiedades topic/group.id.
La salida es revisable y no se ejecuta ni se carga automáticamente.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import shlex

ROOT = Path(__file__).resolve().parents[2]
DATASET_ID = "SDWIN-200502035409"
OFFICIAL_PLAN = "https://attackevals.github.io/ael/enterprise/apt29/emulation_plan/scenario_2/"
SOURCE_FILES = [
    "p1_comun.sql", "p1_06_flujo.sql", "p1_08_emision.sql",
    "p2_comun.sql", "p2_02_flujo.sql", "p2_04_emision.sql",
    "p3_comun.sql", "p3_01_flujo.sql", "p3_03_emision.sql",
]
PROPERTY = re.compile(r"('(topic|properties\.group\.id)'\s*=\s*)'([^']+)'", re.I)

# Reconstrucción revisada del XLSX; los detalles/erratas se documentan abajo.
# No se deducen horas, éxito de la ejecución ni cuentas de campañas del plan.
STEPS = {
    "11.A": "T1204.002 T1564.004 T1497.001 T1082 T1120 T1033 T1016 T1057 T1083 T1547.001 T1140 T1059.001 T1071.001 T1573.002",
    "12.A": "T1070.006 T1083", "12.B": "T1518.001", "12.C": "T1012",
    "13.A": "T1082", "13.B": "T1016", "13.C": "T1033", "13.D": "T1057",
    "14.A": "T1546.015 T1548.002",
    "14.B": "T1047 T1105 T1003.001 T1027 T1057 T1140",
    "15.A": "T1546.003 T1033", "16.A": "T1018", "16.B": "T1033 T1106",
    "16.C": "T1078.002 T1021.006", "16.D": "T1570 T1003.001",
    "17.A": "T1114.001", "17.B": "T1005 T1074.001",
    "17.C": "T1560.001 T1027", "18.A": "T1567.002",
    "19.A": "T1070.004 T1055.002", "19.B": "T1070.004 T1055.002",
    "19.C": "T1070.004 T1055.002", "20.A": "T1218.011 T1546.003 T1059.001",
    "20.B": "T1558.001 T1550.003 T1021.006 T1136.001",
}


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def topic_map(run_id):
    return {"norm.events": f"norm.fa.{run_id}.events",
            "det.alerts": f"det.fa.{run_id}.alerts",
            "det.campaigns": f"det.fa.{run_id}.campaigns",
            **{f"det.p{i}_flujo": f"det.fa.{run_id}.p{i}_flujo" for i in (1, 2, 3)}}


def isolate_sql(sql, run_id):
    """Solo reescribe propiedades de conectores; verifica reversibilidad exacta."""
    mapping = topic_map(run_id)
    substitutions = []

    def replace(match):
        key, original = match[2].lower(), match[3]
        if key == "topic":
            if original not in mapping:
                raise ValueError(f"Topic no previsto: {original}")
            isolated = mapping[original]
        else:
            isolated = f"{run_id}-{original}"
        substitutions.append({"property": key, "source": original, "isolated": isolated})
        return f"{match[1]}'{isolated}'"

    rewritten = PROPERTY.sub(replace, sql)
    reverse_index = {(s["property"], s["isolated"]): s["source"] for s in substitutions}
    restored = PROPERTY.sub(lambda m: f"{m[1]}'{reverse_index[(m[2].lower(), m[3])]}'", rewritten)
    if restored != sql:
        raise ValueError("Se modificó algo además de las propiedades autorizadas")
    # Se eliminan comentarios de línea completa con comandos F3 para evitar que
    # un lector copie por accidente ejemplos originales que borran topics.
    lines = [line for line in rewritten.splitlines() if not line.lstrip().startswith("--")]
    return "-- SQL derivado para FA; no modifica la semántica del patrón.\n" + "\n".join(lines) + "\n", substitutions


def truth_proposal(profile):
    local_plan = ROOT / profile / "emulation-plan-day2.json"
    plan = json.loads(local_plan.read_text())
    actual_steps = {r["C"].strip() for r in plan["rows"]}
    if actual_steps != set(STEPS):
        raise ValueError(f"Los pasos del XLSX cambiaron: {actual_steps ^ set(STEPS)}")
    stix_path = ROOT / "data/cti/attack/enterprise-attack-19.2.json"
    raw_stix = stix_path.read_bytes()
    objects = json.loads(raw_stix)["objects"]
    techniques = {}
    tactic_ids = {}
    for obj in objects:
        external = next((r.get("external_id") for r in obj.get("external_references", [])
                         if r.get("source_name") == "mitre-attack"), None)
        if obj["type"] == "attack-pattern" and external:
            techniques[external] = obj
        elif obj["type"] == "x-mitre-tactic":
            tactic_ids[obj["x_mitre_shortname"]] = external
    chosen = sorted({t for value in STEPS.values() for t in value.split()})
    tactics = set()
    for technique in chosen:
        obj = techniques[technique]
        if obj.get("revoked") or obj.get("x_mitre_deprecated"):
            raise ValueError(f"Técnica propuesta no activa en STIX local: {technique}")
        tactics.update(tactic_ids[p["phase_name"]] for p in obj.get("kill_chain_phases", [])
                       if p.get("kill_chain_name") == "mitre-attack")
    row = {"dataset_id": DATASET_ID, "origen": "fa",
           "titulo": "APT29 day2 (plan XLSX y escenario 2 revisado)",
           "tecnicas": "|".join(chosen), "tacticas": "|".join(sorted(tactics)),
           "verdad": "parcial", "p1_esperado": 1, "p2_esperado": 1, "p3_esperado": 1}
    report = {
        "dataset_id": DATASET_ID, "status": "propuesta_sin_cargar",
        "local_xlsx_sha256": plan["sha256"], "sheet": "day2",
        "local_stix": str(stix_path.relative_to(ROOT)), "local_stix_sha256": sha256_bytes(raw_stix),
        "official_plan": OFFICIAL_PLAN, "reviewed_at": "2026-11-07",
        "steps": {step: value.split() for step, value in STEPS.items()},
        "corrections": [
            "13.B: el XLSX cita T1063 pero describe dominio; escenario oficial y contexto sustentan T1016.",
            "16.D: T1103 en XLSX corresponde a AppInit DLLs, ajeno al dump KRBTGT descrito; se usa T1003.001 según el procedimiento oficial.",
            "T1043 Commonly Used Port está deprecated: HTTPS:443 no demuestra T1571 Non-Standard Port; no se infiere esa técnica.",
            "20.B: se distinguen Golden Ticket T1558.001, uso de ticket T1550.003 y cuenta local T1136.001; no se infieren Kerberoasting ni robo de cookies.",
            "18.A: la copia a OneDrive se representa como exfiltración T1567.002, sin confundirla con C2 de Web Service.",
        ],
        "expectations": {
            "P1": {"expected": True, "steps": ["14.B", "16.D"], "host_candidates": ["UTICA", "NEWYORK"]},
            "P2": {"expected": True, "steps": ["16.C", "20.B"], "edges_from_xlsx": ["UTICA->NEWYORK", "UTICA->SCRANTON"],
                   "limitation": "El patrón vigente excluye aristas hacia DC; puede no detectar el salto a NEWYORK. No se cambia el patrón."},
            "P3": {"expected": True, "steps": ["11.A", "13.A", "13.B", "13.C", "13.D", "14.A", "15.A"], "host_candidates": ["UTICA"]},
        },
        "limitations": ["Expectativa por escenario, no número esperado de campañas ni garantía de observabilidad.",
                        "Sin horarios por paso ni etiquetas por evento en XLSX; sin validar ejecución/éxito de cada paso.",
                        "Verdad parcial: revisión de contexto histórico; no reemplaza anotación manual de evidencias."],
        "proposed_csv_row": row,
    }
    return report, row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default="fa-day2-20261107")
    parser.add_argument("--profile", type=Path, default=Path("data/fa/20261107-day2-verified"))
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--without-truth", action="store_true", help="Derivar solo el CEP para otros datasets FA")
    args = parser.parse_args()
    if not re.fullmatch(r"fa-[a-z0-9-]+", args.run_id):
        raise SystemExit("run-id inválido")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    (output / "sql").mkdir()
    manifest = {"run_id": args.run_id, "status": "offline_sin_ejecutar", "sql": [],
                "topics": topic_map(args.run_id), "flink_commands": []}
    for name in SOURCE_FILES:
        source = ROOT / "infra/flink/jobs" / name
        raw = source.read_bytes()
        rendered, changes = isolate_sql(raw.decode(), args.run_id)
        (output / "sql" / name).write_text(rendered)
        manifest["sql"].append({"source": str(source.relative_to(ROOT)), "source_sha256": sha256_bytes(raw),
                                "output": f"sql/{name}", "sha256": sha256_bytes(rendered.encode()),
                                "substitutions": changes})
    if not args.without_truth:
        truth, row = truth_proposal(args.profile)
        (output / "truth-proposal.json").write_text(json.dumps(truth, indent=2, ensure_ascii=False) + "\n")
        with (output / "verdad-day2-propuesta.csv").open("x", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=list(row))
            writer.writeheader()
            writer.writerow(row)
    container_dir = f"/tmp/{args.run_id}"
    copy_command = ["docker", "cp", str(args.output / "sql"), f"flink-jobmanager:{container_dir}"]
    for common, flow, emission in [SOURCE_FILES[i:i + 3] for i in (0, 3, 6)]:
        for action in (flow, emission):
            manifest["flink_commands"].append([
                "timeout", "540s", "docker", "exec", "-i", "flink-jobmanager", "./bin/sql-client.sh",
                "-i", f"{container_dir}/{common}", "-f", f"{container_dir}/{action}"])
    manifest["copy_command"] = copy_command
    (output / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    commands = ["# Comandos propuestos, pendientes de aprobación individual", "",
                "No se ha ejecutado ninguno. Los nueve comandos de creación de topics se proponen en `scripts/load_fa_corpus.sh --plan`.",
                "Ejecutar este tramo después de replay, normalización y detección, con el mismo run-id y aprobación individual.", "",
                "```bash", shlex.join(copy_command)]
    commands.extend(shlex.join(c) for c in manifest["flink_commands"])
    commands.extend(["```", "", "No repetir INSERT ni reutilizar topics para otra pasada.",
                     "Falta aprobar carga de verdad, sinks y comprobar foto F3 tras cada carga.",
                     "El plan no está listo para cargar hasta revisar consumidores activos y errores de entrega.",
                     "Un timeout del cliente SQL obliga a revisar si dejó un job activo; no se reintenta automáticamente.", ""])
    (output / "COMMANDS.md").write_text("\n".join(commands))
    print(json.dumps({"output": str(args.output), "sql_files": 9,
                      "truth_techniques": None if args.without_truth else len(row["tecnicas"].split("|")),
                      "expected": None if args.without_truth else {p: row[f"{p}_esperado"] for p in ("p1", "p2", "p3")},
                      "services_executed": False}, indent=2))


if __name__ == "__main__":
    main()
