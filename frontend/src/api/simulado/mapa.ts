/**
 * Escenario geográfico ficticio de Helios. Las ciudades son localizaciones de la demo;
 * no representan la atribución de un atacante ni la geolocalización del corpus APT29.
 */
import type { EscenarioMapa } from '../mapa'

export const MAPA_DEMO: EscenarioMapa = {
  organizacion: 'Helios Farmacéutica',
  procedencia: 'ilustrativa',
  fuente: 'Escenario geográfico ficticio de Helios. Ubicaciones y alertas creadas para el boceto.',
  intervaloMs: 1350,
  ubicaciones: [
    { id: 'madrid', ciudad: 'Madrid', pais: 'España', codigoPais: 'ESP', coordenadas: [-3.7, 40.42] },
    { id: 'barcelona', ciudad: 'Barcelona', pais: 'España', codigoPais: 'ESP', coordenadas: [2.17, 41.39] },
    { id: 'frankfurt', ciudad: 'Fráncfort', pais: 'Alemania', codigoPais: 'DEU', coordenadas: [8.68, 50.11] },
    { id: 'londres', ciudad: 'Londres', pais: 'Reino Unido', codigoPais: 'GBR', coordenadas: [-0.13, 51.51] },
    { id: 'paris', ciudad: 'París', pais: 'Francia', codigoPais: 'FRA', coordenadas: [2.35, 48.86] },
    { id: 'ashburn', ciudad: 'Ashburn', pais: 'Estados Unidos', codigoPais: 'USA', coordenadas: [-77.49, 39.04] },
    { id: 'san-francisco', ciudad: 'San Francisco', pais: 'Estados Unidos', codigoPais: 'USA', coordenadas: [-122.42, 37.77] },
    { id: 'toronto', ciudad: 'Toronto', pais: 'Canadá', codigoPais: 'CAN', coordenadas: [-79.38, 43.65] },
    { id: 'sao-paulo', ciudad: 'São Paulo', pais: 'Brasil', codigoPais: 'BRA', coordenadas: [-46.63, -23.55] },
    { id: 'santiago', ciudad: 'Santiago', pais: 'Chile', codigoPais: 'CHL', coordenadas: [-70.67, -33.45] },
    { id: 'johannesburgo', ciudad: 'Johannesburgo', pais: 'Sudáfrica', codigoPais: 'ZAF', coordenadas: [28.05, -26.2] },
    { id: 'mumbai', ciudad: 'Bombay', pais: 'India', codigoPais: 'IND', coordenadas: [72.88, 19.08] },
    { id: 'singapur', ciudad: 'Singapur', pais: 'Singapur', codigoPais: 'SGP', coordenadas: [103.82, 1.35] },
    { id: 'tokio', ciudad: 'Tokio', pais: 'Japón', codigoPais: 'JPN', coordenadas: [139.69, 35.68] },
    { id: 'sidney', ciudad: 'Sídney', pais: 'Australia', codigoPais: 'AUS', coordenadas: [151.21, -33.87] },
  ],
  rutas: [
    { id: 'c2-atlantico', origen: 'ashburn', destino: 'madrid', nivel: 'high', titulo: 'Conexión a un indicador de mando y control', sensor: 'HEL-MAD-FW01', categoria: 'Red' },
    { id: 'autenticacion', origen: 'frankfurt', destino: 'barcelona', nivel: 'medium', titulo: 'Ráfaga de intentos de autenticación', sensor: 'HEL-BCN-IAM01', categoria: 'Identidad' },
    { id: 'salida-asia', origen: 'madrid', destino: 'singapur', nivel: 'critical', titulo: 'Transferencia de datos fuera del patrón habitual', sensor: 'HEL-MAD-DLP01', categoria: 'Datos' },
    { id: 'sondeo', origen: 'sao-paulo', destino: 'paris', nivel: 'low', titulo: 'Sondeo de servicios del perímetro', sensor: 'HEL-PAR-FW01', categoria: 'Red' },
    { id: 'c2-asia', origen: 'tokio', destino: 'frankfurt', nivel: 'high', titulo: 'Comunicación periódica con un destino inusual', sensor: 'HEL-FRA-NDR01', categoria: 'Red' },
    { id: 'dns', origen: 'sidney', destino: 'singapur', nivel: 'medium', titulo: 'Consultas DNS con una frecuencia inusual', sensor: 'HEL-SIN-DNS01', categoria: 'Red' },
    { id: 'sesion', origen: 'toronto', destino: 'madrid', nivel: 'informational', titulo: 'Nueva sesión remota para revisión', sensor: 'HEL-MAD-IAM01', categoria: 'Identidad' },
    { id: 'acceso', origen: 'johannesburgo', destino: 'londres', nivel: 'high', titulo: 'Acceso remoto fuera del horario esperado', sensor: 'HEL-LON-IAM01', categoria: 'Identidad' },
    { id: 'fuerza-bruta', origen: 'mumbai', destino: 'frankfurt', nivel: 'medium', titulo: 'Intentos fallidos sobre varias cuentas', sensor: 'HEL-FRA-IAM01', categoria: 'Identidad' },
    { id: 'salida-atlantico', origen: 'madrid', destino: 'ashburn', nivel: 'critical', titulo: 'Salida de datos hacia una ubicación no habitual', sensor: 'HEL-MAD-DLP01', categoria: 'Datos' },
    { id: 'pacifico', origen: 'san-francisco', destino: 'sidney', nivel: 'high', titulo: 'Transferencia entre regiones pendiente de revisión', sensor: 'HEL-SYD-NDR01', categoria: 'Datos' },
    { id: 'web', origen: 'santiago', destino: 'madrid', nivel: 'low', titulo: 'Solicitud a un recurso web restringido', sensor: 'HEL-MAD-WAF01', categoria: 'Red' },
    { id: 'europa-asia', origen: 'paris', destino: 'tokio', nivel: 'medium', titulo: 'Conexión a un servicio no inventariado', sensor: 'HEL-PAR-NDR01', categoria: 'Red' },
  ],
}
