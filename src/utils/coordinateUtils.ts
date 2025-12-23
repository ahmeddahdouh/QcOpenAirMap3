// @ts-ignore - proj4 n'a pas de types TypeScript officiels
import * as proj4Module from 'proj4';

// Utiliser la fonction par défaut ou l'export principal
const proj4 = (proj4Module as any).default || proj4Module;

// Définition de la projection Lambert 93 (EPSG:2154)
const LAMBERT93_PROJECTION = '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Définition de WGS84 (EPSG:4326)
const WGS84_PROJECTION = '+proj=longlat +datum=WGS84 +no_defs';

/**
 * Convertit des coordonnées WGS84 (latitude, longitude) en Lambert 93 (X, Y)
 * @param latitude - Latitude en degrés décimaux (WGS84)
 * @param longitude - Longitude en degrés décimaux (WGS84)
 * @returns Un objet avec les coordonnées X et Y en mètres (Lambert 93)
 */
export function convertWGS84ToLambert93(
  latitude: number,
  longitude: number
): { x: number; y: number } {
  try {
    const [x, y] = proj4(WGS84_PROJECTION, LAMBERT93_PROJECTION, [
      longitude,
      latitude,
    ]);
    return { x, y };
  } catch (error) {
    console.error('Erreur lors de la conversion en Lambert 93:', error);
    return { x: 0, y: 0 };
  }
}
