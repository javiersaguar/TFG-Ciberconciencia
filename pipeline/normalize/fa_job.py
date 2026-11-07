"""Entrada FA al job vigente, con despacho propio y clave por host/sensor.

No cambia el registro ni el job de los datasets de F3.
"""


def main():
    from pipeline.normalize.fa_consumer import install
    install()
    from pipeline.jobs import normalize_job
    from pipeline.normalize.fa_registry import normalize

    normalize_job.normalize = normalize
    normalize_job.clave_particion = lambda event: str(event.get("device", {}).get("hostname") or "unknown").encode()
    normalize_job.main()


if __name__ == "__main__":
    main()
