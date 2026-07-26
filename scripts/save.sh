#!/usr/bin/env bash
# Guarda el trabajo en los dos repositorios del TFG (codigo y memoria).
#
# Uso:
#   ./scripts/save.sh "mensaje del commit"
#   ./scripts/save.sh "mensaje codigo" "mensaje memoria"
#   ./scripts/save.sh -n "mensaje"        (dry-run: solo muestra, no commitea)
#
# Muestra siempre los cambios y pide confirmacion antes de commitear.
set -uo pipefail

REPO_CODIGO="$HOME/proyectos/tfg-ciberconciencia"
REPO_MEMORIA="$HOME/proyectos/tfg-memoria"

DRY_RUN=false
if [[ "${1:-}" == "-n" || "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 [-n] \"mensaje del commit\" [\"mensaje memoria\"]"
  exit 1
fi

MSG_CODIGO="$1"
MSG_MEMORIA="${2:-docs: actualizar bitacora y memoria}"

# --- colores ---
B=$'\e[1m'; V=$'\e[32m'; A=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'

hay_cambios() {
  [[ -n "$(git -C "$1" status --porcelain)" ]]
}

mostrar() {
  local repo="$1" nombre="$2"
  echo ""
  echo "${B}=== $nombre ===${N}  $repo"
  if [[ ! -d "$repo/.git" ]]; then
    echo "  ${R}no es un repositorio git${N}"
    return 1
  fi
  if hay_cambios "$repo"; then
    git -C "$repo" status --short | sed 's/^/  /'
    local n
    n=$(git -C "$repo" status --porcelain | wc -l)
    echo "  ${A}$n fichero(s) con cambios${N}"
  else
    echo "  ${V}sin cambios${N}"
  fi
}

guardar() {
  local repo="$1" nombre="$2" mensaje="$3"

  if ! hay_cambios "$repo"; then
    echo "  ${V}[$nombre] sin cambios, nada que hacer${N}"
    return 0
  fi

  echo "  [$nombre] commit: $mensaje"
  git -C "$repo" add -A || { echo "  ${R}fallo en git add${N}"; return 1; }
  git -C "$repo" commit -m "$mensaje" || { echo "  ${R}fallo en commit${N}"; return 1; }

  if git -C "$repo" remote | grep -q origin; then
    git -C "$repo" push || { echo "  ${R}fallo en push${N}"; return 1; }
    echo "  ${V}[$nombre] subido${N}"
  else
    echo "  ${A}[$nombre] sin remoto configurado, solo commit local${N}"
  fi
}

# --- revision ---
echo "${B}Revision de cambios${N}"
mostrar "$REPO_CODIGO"  "CODIGO"
mostrar "$REPO_MEMORIA" "MEMORIA"

if ! hay_cambios "$REPO_CODIGO" && ! hay_cambios "$REPO_MEMORIA"; then
  echo ""
  echo "${V}Nada que guardar.${N}"
  exit 0
fi

if $DRY_RUN; then
  echo ""
  echo "${A}Dry-run: no se ha commiteado nada.${N}"
  exit 0
fi

# --- confirmacion ---
echo ""
echo "Mensajes:"
echo "  codigo  : $MSG_CODIGO"
echo "  memoria : $MSG_MEMORIA"
echo ""
read -r -p "¿Guardar y subir? [s/N] " respuesta
if [[ ! "$respuesta" =~ ^[sSyY]$ ]]; then
  echo "${A}Cancelado.${N}"
  exit 0
fi

# --- ejecucion ---
echo ""
guardar "$REPO_CODIGO"  "CODIGO"  "$MSG_CODIGO"
guardar "$REPO_MEMORIA" "MEMORIA" "$MSG_MEMORIA"
echo ""
echo "${V}Hecho.${N}"