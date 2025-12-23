import { Seuils } from "../types";

/**
 * Détermine le niveau de qualité de l'air selon la valeur et les seuils
 * @param value - La valeur mesurée
 * @param thresholds - Les seuils de qualité de l'air
 * @returns Le code du niveau (bon, moyen, degrade, mauvais, tresMauvais, extrMauvais, default)
 */
export function getAirQualityLevel(value: number, thresholds: Seuils): string {
  // Vérifier que la valeur est valide
  if (
    value === null ||
    value === undefined ||
    isNaN(value) ||
    typeof value !== "number"
  ) {
    return "default";
  }

  if (value <= thresholds.bon.max) return "bon";
  if (value <= thresholds.moyen.max) return "moyen";
  if (value <= thresholds.degrade.max) return "degrade";
  if (value <= thresholds.mauvais.max) return "mauvais";
  if (value <= thresholds.tresMauvais.max) return "tresMauvais";
  return "extrMauvais";
}

// Import de la fonction centralisée depuis les constantes
export {
  getMarkerPath,
  getAvailableLevels,
  getDefaultLevel,
  markerExists,
} from "../constants/markers";
