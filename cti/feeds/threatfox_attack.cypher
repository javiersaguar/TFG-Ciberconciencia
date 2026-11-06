// Enlace de las familias de malware de ThreatFox con el software de ATT&CK (F4.1).
//
// Regla: una familia (:Malware con x_malpedia_id) se enlaza con un software de ATT&CK si su
// nombre o algun alias coincide, sin distinguir mayusculas, con el nombre o un alias del
// software. Si coincide con MAS DE UN software, el enlace es ambiguo y no se crea: los
// alias se comparten entre familias distintas. Medido el 06-11-2026:
//   - "Snake" (ransomware EKANS) tambien casaba con Uroburos, el "Snake" de Turla;
//   - DarkComet casaba con PoisonIvy por el alias compartido "Breut".
// Un enlace unico tambien puede ser un homonimo: es una heuristica y se presenta como tal.
//
// Uso (idempotente; se puede repetir tras cada carga del feed):
//   docker exec -i neo4j cypher-shell -u neo4j -p tfg-neo4j --format plain < cti/feeds/threatfox_attack.cypher

// 1. Candidatos por nombre o alias
MATCH (m:Malware) WHERE m.x_malpedia_id IS NOT NULL
WITH m, [x IN [m.name] + coalesce(m.aliases, []) | toLower(x)] AS nm
MATCH (s:Software)
WHERE s.external_id IS NOT NULL AND NOT coalesce(s.revoked, false)
  AND any(x IN [s.name] + coalesce(s.aliases, []) WHERE toLower(x) IN nm)
WITH m, collect(s) AS candidatos
// 2. Solo los enlaces sin ambiguedad; los ambiguos se marcan en la familia para revisarlos
FOREACH (s IN CASE WHEN size(candidatos) = 1 THEN candidatos ELSE [] END |
  MERGE (m)-[r:SAME_AS]->(s) SET r.metodo = 'nombre o alias, coincidencia unica')
SET m.attack_candidatos = [s IN candidatos | s.external_id]
RETURN sum(CASE WHEN size(candidatos) = 1 THEN 1 ELSE 0 END) AS familias_enlazadas,
       sum(CASE WHEN size(candidatos) > 1 THEN 1 ELSE 0 END) AS familias_ambiguas;

// 3. Quitar enlaces ambiguos de cargas anteriores
MATCH (m:Malware)-[r:SAME_AS]->()
WHERE size(coalesce(m.attack_candidatos, [])) > 1
DELETE r
RETURN count(r) AS enlaces_ambiguos_borrados;

// 4. Cobertura: IOCs que llegan a tecnicas de ATT&CK a traves de su familia
MATCH (i:Indicator)-[:INDICATES]->(m:Malware)
WITH count(i) AS iocs, sum(CASE WHEN EXISTS { (m)-[:SAME_AS]->() } THEN 1 ELSE 0 END) AS con_attack
RETURN iocs, con_attack, round(100.0 * con_attack / iocs, 1) AS porcentaje;
