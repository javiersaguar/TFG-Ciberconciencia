"""Genera infra/.env con secretos aleatorios para el perfil `cti` (OpenCTI).

No sobrescribe un infra/.env existente. No imprime los valores.
Uso (desde la raiz del repo):  python3 scripts/gen_env_opencti.py
"""
import base64
import secrets
import sys
import uuid
from pathlib import Path

destino = Path(__file__).resolve().parent.parent / "infra" / ".env"
if destino.exists():
    sys.exit(f"{destino} ya existe: no se toca")

valores = {
    "OPENCTI_ADMIN_EMAIL": "admin@tfg.local",
    "OPENCTI_ADMIN_PASSWORD": secrets.token_urlsafe(18),
    "OPENCTI_ADMIN_TOKEN": str(uuid.uuid4()),
    "OPENCTI_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
    "OPENCTI_HEALTHCHECK_ACCESS_KEY": secrets.token_urlsafe(18),
    "MINIO_ROOT_USER": "opencti",
    "MINIO_ROOT_PASSWORD": secrets.token_urlsafe(24),
    "RABBITMQ_DEFAULT_USER": "opencti",
    "RABBITMQ_DEFAULT_PASS": secrets.token_urlsafe(24),
    "CONNECTOR_MITRE_ID": str(uuid.uuid4()),
    "CONNECTOR_EXPORT_FILE_STIX_ID": str(uuid.uuid4()),
    "CONNECTOR_IMPORT_FILE_STIX_ID": str(uuid.uuid4()),
    "CONNECTOR_IMPORT_DOCUMENT_ID": str(uuid.uuid4()),
}
destino.write_text("".join(f"{k}={v}\n" for k, v in valores.items()), encoding="utf-8")
destino.chmod(0o600)
print(f"{destino} creado con {len(valores)} variables (permisos 600)")
