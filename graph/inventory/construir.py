"""Filas de ClickHouse -> nodos y relaciones del inventario (sin dependencias: se prueba sin bases de datos).

Aplica las reglas de inferencia de graph/model.md. La entrada son las filas que saca
graph.inventory.extraer para UN escenario; la salida, dos listas:

  nodos       {"id", "labels", "props"}
  relaciones  {"id", "tipo", "origen", "destino", "props"}; las que apuntan a una tecnica de ATT&CK
              llevan "destino_externo" (su external_id) en lugar de "destino".

Todos los identificadores son deterministas, y todo lleva `escenario` y `origen` (observado o inferido).
"""
import collections
import ipaddress

PUERTO_EFIMERO = 49152
SERVICIOS = {53: "dns", 80: "http", 88: "kerberos", 123: "ntp", 135: "rpc", 137: "netbios-ns",
             138: "netbios-dgm", 139: "netbios-ssn", 389: "ldap", 443: "https", 445: "smb",
             636: "ldaps", 3268: "global-catalog", 3389: "rdp", 5985: "winrm", 5986: "winrm-https",
             8080: "http-alt", 8443: "https-alt"}
PRIVILEGIO_ADMIN = "SeDebugPrivilege"


def corto(fqdn):
    return fqdn.split(".")[0].upper()


def ip_valida(texto):
    """IPv4 de un equipo concreto: ni difusion, ni bucle local, ni multidifusion, ni enlace local."""
    try:
        ip = ipaddress.ip_address(texto)
    except ValueError:
        return None
    if ip.version != 4 or ip.is_loopback or ip.is_multicast or ip.is_link_local or ip.is_unspecified:
        return None
    if str(ip).endswith(".255"):
        return None
    return ip


def construir(escenario, red_interna, filas):
    red = ipaddress.ip_network(red_interna)
    nodos, rels = {}, {}

    def nodo(id_, labels, origen, **props):
        n = nodos.setdefault(id_, {"id": id_, "labels": ["TfgObject", *labels],
                                   "props": {"id": id_, "escenario": escenario, "origen": origen}})
        n["props"].update(props)
        return id_

    def rel(tipo, a, b, origen, clave="", externo=False, **props):
        id_ = f"{a}|{tipo}|{b}" + (f"|{clave}" if clave else "")
        r = {"id": id_, "tipo": tipo, "origen": a,
             "props": {"id": id_, "escenario": escenario, "origen": origen, **props}}
        r["destino_externo" if externo else "destino"] = b
        rels[id_] = r

    # --- equipos monitorizados y su IP (regla 1)
    por_equipo = collections.defaultdict(collections.Counter)
    for f in filas["ips"]:
        if ip_valida(f["ip"]):
            por_equipo[corto(f["host"])][f["ip"]] += f["n"]
    fqdn = {corto(f["host"]): f["host"] for f in filas["ips"]}
    for f in filas["sesiones"] + filas["privilegios"]:
        fqdn.setdefault(corto(f["host"]), f["host"])
    ip_de, equipo_de_ip = {}, {}
    for h in sorted(fqdn):
        ips = por_equipo.get(h)
        if ips:
            ip_de[h] = sorted(ips.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
            equipo_de_ip[ip_de[h]] = h

    def zona(ip):
        if ip in red:
            cidr = str(ipaddress.ip_network(f"{ip}/24", strict=False))
            return nodo(f"{escenario}/zone/{cidr}", ["Zone"], "inferido", cidr=cidr, kind="interna")
        if ip.is_private:
            return nodo(f"{escenario}/zone/externa", ["Zone"], "inferido", cidr="", kind="externa")
        return nodo(f"{escenario}/zone/internet", ["Zone"], "inferido", cidr="", kind="internet")

    def equipo(ip_texto):
        """Id del equipo que tiene esa IP; si no esta monitorizado, se crea como tal (regla 2)."""
        if ip_texto in equipo_de_ip:
            return f"{escenario}/host/{equipo_de_ip[ip_texto]}"
        ip = ip_valida(ip_texto)
        if ip is None:
            return None
        if not ip.is_private:   # las direcciones publicas se agrupan en un unico nodo
            id_ = nodo(f"{escenario}/host/internet", ["Host"], "inferido", name="internet", ips=[],
                       monitored=False, role="internet")
            rel("IN_ZONE", id_, zona(ip), "inferido")
            return id_
        id_ = nodo(f"{escenario}/host/{ip}", ["Host"], "observado", name=str(ip), ips=[str(ip)],
                   monitored=False, role="workstation" if ip in red else "external")
        rel("IN_ZONE", id_, zona(ip), "inferido")
        return id_

    for h in sorted(fqdn):
        id_ = nodo(f"{escenario}/host/{h}", ["Host"], "observado", name=h, fqdn=fqdn[h],
                   ips=[ip_de[h]] if h in ip_de else [], monitored=True, role="workstation")
        if h in ip_de:
            rel("IN_ZONE", id_, zona(ipaddress.ip_address(ip_de[h])), "inferido")

    # --- conexiones y servicios (regla 4)
    con = {}
    for f in filas["conexiones"]:
        if not 0 < f["port"] < PUERTO_EFIMERO:
            continue
        a, b = equipo(f["src"]), equipo(f["dst"])
        if a is None or b is None or a == b:
            continue
        c = con.setdefault((a, b, f["proto"], f["port"]),
                           {"events": 0, "recorders": set(), "first": f["first"], "last": f["last"], "procs": set(),
                            "pares": set()})
        c["events"] += f["n"]
        c["pares"].add((f["src"], f["dst"]))
        c["recorders"].add(corto(f["recorder"]))
        c["first"], c["last"] = min(c["first"], f["first"]), max(c["last"], f["last"])
        c["procs"].update(p for p in f["procs"] if p)
    atiende = collections.defaultdict(set)
    for (a, b, proto, port), c in sorted(con.items()):
        nombre = SERVICIOS.get(port, "")
        rel("CONNECTS_TO", a, b, "observado", clave=f"{proto}/{port}", port=port, proto=proto, service=nombre,
            events=c["events"], peers=len(c["pares"]), recorders=sorted(c["recorders"]), first_seen=c["first"], last_seen=c["last"],
            processes=sorted(c["procs"])[:8])
        svc = nodo(f"{escenario}/svc/{b.rsplit('/', 1)[1]}/{proto}/{port}", ["Service"], "observado",
                   port=port, proto=proto, name=nombre)
        rel("RUNS", b, svc, "observado")
        atiende[b].add(port)
    for h, puertos in atiende.items():       # regla 5
        if {88, 389} <= puertos and nodos[h]["props"]["role"] == "workstation":
            nodos[h]["props"]["role"] = "domain_controller"

    # --- usuarios, sesiones y privilegios (reglas 6 y 7)
    def usuario(f):
        sid = f["sid"]
        if not sid.startswith("S-1-5-21-") or f["user"].endswith("$"):
            return None
        rid = int(sid.rsplit("-", 1)[1])
        return nodo(f"{escenario}/user/{sid}", ["User"], "observado", name=f["user"].lower(),
                    domain=f["domain"].split(".")[0].upper(), sid=sid, rid=rid, builtin_admin=rid == 500)

    ses = {}
    for f in filas["sesiones"]:
        u = usuario(f)
        if u is None:
            continue
        s = ses.setdefault((u, f"{escenario}/host/{corto(f['host'])}"),
                           {"tipos": set(), "events": 0, "ips": set(), "first": f["first"], "last": f["last"]})
        s["tipos"].add(f["logon_type"])
        s["events"] += f["n"]
        if ip_valida(f["src"]):
            s["ips"].add(f["src"])
        s["first"], s["last"] = min(s["first"], f["first"]), max(s["last"], f["last"])
    for (u, h), s in sorted(ses.items()):
        rel("LOGGED_ON", u, h, "observado", logon_types=sorted(s["tipos"]), events=s["events"],
            from_ips=sorted(s["ips"]), first_seen=s["first"], last_seen=s["last"])
    adm = {}
    for f in filas["privilegios"]:
        if PRIVILEGIO_ADMIN not in f["privileges"]:
            continue
        u = usuario(f)
        if u is None:
            continue
        a = adm.setdefault((u, f"{escenario}/host/{corto(f['host'])}"),
                           {"events": 0, "privs": set(), "first": f["first"], "last": f["last"]})
        a["events"] += f["n"]
        a["privs"].update(f["privileges"])
        a["first"], a["last"] = min(a["first"], f["first"]), max(a["last"], f["last"])
    for (u, h), a in sorted(adm.items()):
        rel("ADMIN_OF", u, h, "inferido", events=a["events"], privileges=sorted(a["privs"]),
            first_seen=a["first"], last_seen=a["last"])

    # --- campanas del Pilar A
    for c in filas["campanas"]:
        doc = c["documento"]
        etapas = sorted(doc["tfg"].get("stages", []), key=lambda e: e["order"])
        cid = nodo(c["campaign_id"], ["Campaign"], "observado", pattern_id=c["pattern_id"], title=c["title"],
                   dataset_id=c["dataset_id"], first_seen=c["first_seen"], last_seen=c["last_seen"],
                   confidence=c["confidence_score"], severity=c["severity_id"],
                   stages=[e["name"] for e in etapas], techniques=sorted(c["technique_ids"]),
                   evidence_count=c["related_events_count"], version=c["version"])
        for d in doc["tfg"]["devices"]:
            h = f"{escenario}/host/{corto(d['hostname'])}"
            if h not in nodos:
                nodo(h, ["Host"], "observado", name=corto(d["hostname"]), fqdn=d["hostname"], ips=[],
                     monitored=True, role="workstation")
            rel("OBSERVED_ON", cid, h, "observado", clave=d["role"], role=d["role"])
        for t in sorted(set(c["technique_ids"])):
            rel("EVIDENCES", cid, t, "observado", externo=True)

    return sorted(nodos.values(), key=lambda n: n["id"]), sorted(rels.values(), key=lambda r: r["id"])
