"""Audita campos realmente leídos por los mapeadores presentes en COMISET v1."""
import argparse
import ast
import collections
import inspect
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.normalize.comiset import adapt_comiset, normalize_comiset
from pipeline.normalize.registry import MAPPERS


def at(value, path):
    for key in path.split("."):
        value = value.get(key) if isinstance(value, dict) else None
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/fa/20261107-comiset-v1-ready"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    reads = {}
    for key, mapper in MAPPERS.items():
        reads[key] = sorted({n.args[0].value for n in ast.walk(ast.parse(inspect.getsource(mapper)))
                            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                            and isinstance(n.func.value, ast.Name) and n.func.value.id == "event"
                            and n.func.attr == "get" and n.args and isinstance(n.args[0], ast.Constant)
                            and isinstance(n.args[0].value, str)})
    counts = collections.Counter()
    fields = collections.defaultdict(collections.Counter)
    normalized_values = collections.defaultdict(collections.Counter)
    examples = []
    for path in sorted(args.input_dir.glob("COMISET-*.jsonl")):
        dataset = path.stem
        with path.open(encoding="utf-8") as source:
            for line in source:
                event = json.loads(line)
                raw = event["_source"]
                adapted = adapt_comiset(event)
                key = (adapted["Channel"].lower(), adapted["EventID"])
                counts["input"] += 1
                if key not in reads:
                    counts["unsupported"] += 1
                    continue
                result = normalize_comiset(event, dataset_id=dataset)
                counts["normalized"] += 1
                eid = str(adapted["EventID"])
                for field in reads[key]:
                    entry = fields[(eid, field)]
                    entry["read"] += 1
                    available = raw.get(field) not in (None, "")
                    value = adapted.get(field)
                    if available:
                        entry["native_present"] += 1
                    elif value not in (None, ""):
                        entry["filled_by_adapter"] += 1
                    else:
                        entry["missing_in_source"] += 1
                    if available and value != raw[field]:
                        entry["native_changed"] += 1
                paths = {"Image": "process.file.path" if eid == "1" else "actor.process.file.path",
                         "SourceImage": "actor.process.file.path", "TargetImage": "process.file.path",
                         "ParentImage": "process.parent_process.file.path", "ImageLoaded": "module.file.path",
                         "TargetFilename": "file.path", "TargetObject": "unmapped.TargetObject",
                         "GrantedAccess": "unmapped.GrantedAccess", "CallTrace": "unmapped.CallTrace",
                         "SourceUser": "unmapped.SourceUser", "TargetUser": "unmapped.TargetUser",
                         "CommandLine": "process.cmd_line", "ParentCommandLine": "process.parent_process.cmd_line",
                         "IntegrityLevel": "unmapped.IntegrityLevel", "CurrentDirectory": "unmapped.CurrentDirectory",
                         "LogonId": "unmapped.LogonId", "OriginalFileName": "unmapped.OriginalFileName",
                         "Company": "unmapped.Company", "SignatureStatus": "unmapped.SignatureStatus",
                         "EventType": "unmapped.EventType", "Details": "unmapped.Details", "NewName": "unmapped.NewName"}
                paths["User"] = "actor.user.name"
                paths["Signature"] = "module.file.signature.certificate.subject"
                for field, destination in paths.items():
                    if field not in reads[key]:
                        continue
                    value = adapted.get(field)
                    entry = normalized_values[(eid, field)]
                    if value in (None, ""):
                        entry["empty_before_mapping"] += 1
                    elif at(result, destination) == value or (field == "GrantedAccess" and at(result, destination) == str(value)):
                        entry["preserved"] += 1
                    else:
                        entry["mismatch"] += 1
                        if len(examples) < 20:
                            examples.append({"_id": event["_id"], "event_id": eid, "field": field,
                                             "expected": value, "actual": at(result, destination)})
                for field, destination in (("SourceProcessId", "actor.process.pid"),
                                            ("TargetProcessId", "process.pid"),
                                            ("ProcessId", "process.pid" if eid == "1" else "actor.process.pid"),
                                            ("ParentProcessId", "process.parent_process.pid")):
                    if field not in reads[key] or adapted.get(field) in (None, ""):
                        continue
                    value = str(adapted[field])
                    expected = int(value, 16 if value.lower().startswith("0x") else 10)
                    normalized_values[(eid, field)]["preserved" if at(result, destination) == expected else "mismatch"] += 1
                if "Signed" in reads[key]:
                    expected = 1 if str(adapted.get("Signed")).lower() == "true" else 2
                    actual = at(result, "module.file.signature.state_id")
                    normalized_values[(eid, "Signed")]["preserved" if actual == expected else "mismatch"] += 1
                if "Hashes" in reads[key]:
                    algorithms = {"MD5": 1, "SHA1": 2, "SHA256": 3}
                    expected = sorted((algorithms[a.strip().upper()], value.strip())
                                      for part in str(adapted.get("Hashes") or "").split(",")
                                      for a, sep, value in [part.partition("=")]
                                      if sep and a.strip().upper() in algorithms)
                    destination = "module.file.hashes" if eid == "7" else "process.file.hashes"
                    actual = sorted((h["algorithm_id"], h["value"]) for h in at(result, destination) or [])
                    normalized_values[(eid, "Hashes")]["preserved" if actual == expected else "mismatch"] += 1
    report = {"counts": dict(counts),
              "mapper_field_reads": [{"event_id": eid, "field": field, **dict(v)}
                                     for (eid, field), v in sorted(fields.items())],
              "mapped_value_checks": [{"event_id": eid, "field": field, **dict(v)}
                                       for (eid, field), v in sorted(normalized_values.items())],
              "mismatch_examples": examples,
              "limits": ["No convierte ausencia de fuente en ausencia de ataque.",
                         "Comprueba todos los nombres leídos por los mapeadores presentes y valores materiales listados; no validación OCSF exhaustiva.",
                         "Campos no usados por el mapeador siguen conservados en unmapped.comiset_source."]}
    (args.output / "REPORT.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"counts": report["counts"], "read_fields": len(fields),
                      "mapped_fields": len(normalized_values),
                      "value_mismatches": sum(v.get("mismatch", 0) for v in normalized_values.values()),
                      "native_changes": sum(v.get("native_changed", 0) for v in fields.values())}, indent=2))


if __name__ == "__main__":
    main()
