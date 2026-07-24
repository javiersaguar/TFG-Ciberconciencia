"""Prueba rapida del mapeador Sysmon 10 con un evento real del dataset."""
import json
from pipeline.normalize.sysmon import map_sysmon_10

SAMPLE = "data/samples/psh_lsass_memory_dump_comsvcs_2020-10-18T19500924.json"

def main():
    encontrados = 0
    with open(SAMPLE) as fh:
        for line in fh:
            e = json.loads(line)
            if e.get("EventID") == 10 and "lsass" in str(e.get("TargetImage", "")).lower():
                ocsf = map_sysmon_10(e)
                print(json.dumps(ocsf, indent=2, ensure_ascii=False))
                encontrados += 1
                if encontrados >= 2:
                    break
    print(f"\nEventos LSASS mapeados: {encontrados}")

if __name__ == "__main__":
    main()