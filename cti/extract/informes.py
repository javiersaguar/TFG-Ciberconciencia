"""Limpieza de los informes publicos de Microsoft para ML-2 (F4.3, paso 6).

Los HTML son datos descargados: solo se parsean con html.parser, sin ejecutar nada. Se toma el
cuerpo del articulo (el elemento con clase `entry-content`) y se trocea en bloques de texto
(parrafos, elementos de lista, celdas, encabezados) y luego en frases.

Cada frase lleva la pila de encabezados bajo la que aparece. Reglas fijadas antes de mirar
ningun resultado:
  - se PARA en "Related posts" (a partir de ahi son otros articulos y menus);
  - se DESCARTAN las secciones de defensa y producto: mitigaciones, proteccion, deteccion,
    consultas de busqueda, productos de Microsoft, IOC, referencias, "learn more";
  - se MARCAN como `attack` las tablas "MITRE ATT&CK techniques observed": son el mapeo del
    propio editor y alimentan en parte la ficha de ATT&CK del grupo, asi que el perfil
    principal se calcula sin ellas y se informa aparte con ellas.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.extract.informes MS-2021-03-04   # muestra secciones y frases
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

CARPETA = Path("data/external/cti-public-reports")
APT29 = ["MS-2020-12-18", "MS-2021-03-04", "MS-2021-05-27", "MS-2022-08-24", "MS-2024-01-25", "MS-2024-10-29"]

PARAR = re.compile(r"^related posts$", re.I)
DESCARTAR = re.compile(
    r"mitigat|protection|hardening|recommend|hunting|detection|defender|sentinel|antivirus|"
    r"\bedr\b|indicators of compromise|\biocs?\b|references|learn more|talk to us|"
    r"microsoft threat intelligence|threat analytics|strengthen|user education|"
    r"threat intelligence reports|find solarwinds|get started|ioc lookup", re.I)
ATTACK = re.compile(r"mitre att&(amp;)?ck techniques observed", re.I)
BLOQUES = {"p", "li", "td", "th", "pre", "blockquote", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6"}
_FRASE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(\[])")


class _Cuerpo(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.prof = 0            # profundidad dentro de entry-content (0 = fuera)
        self.ignorar = 0         # dentro de script/style
        self.bloque = None
        self.texto = []
        self.salida = []         # (etiqueta, texto)

    def handle_starttag(self, tag, attrs):
        if self.prof:
            self.prof += 1
        elif "entry-content" in (dict(attrs).get("class") or "").split():
            self.prof = 1
            return
        if not self.prof:
            return
        if tag in ("script", "style", "noscript", "svg"):
            self.ignorar += 1
        if tag in BLOQUES and self.bloque is None:
            self.bloque, self.texto = tag, []
        if tag == "br":
            self.texto.append(" ")

    def handle_startendtag(self, tag, attrs):
        if self.prof and tag == "br":
            self.texto.append(" ")

    def handle_endtag(self, tag):
        if not self.prof:
            return
        if tag in ("script", "style", "noscript", "svg") and self.ignorar:
            self.ignorar -= 1
        if tag == self.bloque:
            t = re.sub(r"\s+", " ", "".join(self.texto)).strip()
            if t:
                self.salida.append((tag, t))
            self.bloque = None
        self.prof -= 1

    def handle_data(self, data):
        if self.prof and not self.ignorar and self.bloque is not None:
            self.texto.append(data)


def frases(nombre, carpeta=CARPETA):
    """Lista de {doc, seccion, tipo, texto}; tipo es 'analisis', 'attack' o 'descartada'."""
    p = _Cuerpo()
    p.feed((carpeta / f"{nombre}.html").read_text(encoding="utf-8"))
    pila, out = {}, []
    for tag, t in p.salida:
        if tag[0] == "h" and tag[1:].isdigit():
            if PARAR.match(t):
                break
            nivel = int(tag[1:])
            pila = {k: v for k, v in pila.items() if k < nivel}
            pila[nivel] = t
            continue
        encabezados = [pila[k] for k in sorted(pila)]
        if any(ATTACK.search(h) for h in encabezados):
            tipo = "attack"
        elif any(DESCARTAR.search(h) for h in encabezados):
            tipo = "descartada"
        else:
            tipo = "analisis"
        for f in _FRASE.split(t):
            f = f.strip()
            if len(f) >= 15:
                out.append({"doc": nombre, "seccion": " > ".join(encabezados), "tipo": tipo, "texto": f})
    return out


def main():
    for nombre in sys.argv[1:] or APT29:
        fs = frases(nombre)
        cuenta = {t: sum(f["tipo"] == t for f in fs) for t in ("analisis", "attack", "descartada")}
        print(f"{nombre}: {cuenta}")
        if len(sys.argv) > 1:
            secciones = {}
            for f in fs:
                secciones.setdefault((f["tipo"], f["seccion"]), []).append(f["texto"])
            for (tipo, s), ts in secciones.items():
                print(f"  [{tipo}] {s or '(inicio)'}: {len(ts)} frases. Ej.: {ts[0][:110]}")


if __name__ == "__main__":
    main()
