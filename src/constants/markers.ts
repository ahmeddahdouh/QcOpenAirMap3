/**
 * Configuration centralisée des marqueurs
 * Centralise tous les chemins et configurations des marqueurs
 */

export interface MarkerConfig {
  source: string;
  basePath: string;
  levels: string[];
  defaultLevel: string;
}

export const MARKER_CONFIGS: Record<string, MarkerConfig> = {
  atmoRef: {
    source: "atmoRef",
    basePath: "atmoRefMarkers/refStationAtmoSud",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  atmoMicro: {
    source: "atmoMicro",
    basePath: "atmoMicroMarkers/microStationAtmoSud",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  nebuleair: {
    source: "nebuleair",
    basePath: "nebuleAirMarkers/nebuleAir",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  purpleair: {
    source: "purpleair",
    basePath: "purpleAirMarkers/purpleAir",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  sensorCommunity: {
    source: "sensorCommunity",
    basePath: "sensorCommunityMarkers/SensorCommunity",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  signalair: {
    source: "signalair",
    basePath: "signalAirMarkers",
    levels: ["odeur", "bruit", "brulage", "visuel", "pollen"],
    defaultLevel: "odeur",
  },
  mobileair: {
    source: "mobileair",
    basePath: "mobileAirMarkers/mobileAir",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
  moduleair: {
    source: "moduleair",
    basePath: "nebuleAirMarkers/nebuleAir",
    levels: [
      "bon",
      "moyen",
      "degrade",
      "mauvais",
      "tresMauvais",
      "extrMauvais",
      "default",
    ],
    defaultLevel: "default",
  },
};

/**
 * Mapping spécial pour SignalAir (types de signalements)
 */
export const SIGNAL_AIR_MAPPING: Record<string, string> = {
  odeur: "odeur",
  bruit: "bruits", // Le fichier s'appelle "bruits.png"
  brulage: "brulage",
  visuel: "visuel",
  pollen: "pollen",
};

/**
 * Obtient le chemin complet d'un marqueur
 * @param source - Le code de la source
 * @param level - Le niveau de qualité ou type de signalement
 * @returns Le chemin complet vers l'image du marqueur
 */
export function getMarkerPath(source: string, level: string): string {
  const config = MARKER_CONFIGS[source];

  if (!config) {
    console.warn(
      `Configuration de marqueur non trouvée pour la source: ${source}`
    );
    return `/markers/atmoRefMarkers/refStationAtmoSud_default.png`;
  }

  // Gestion spéciale pour SignalAir
  if (source === "signalair") {
    const signalType = SIGNAL_AIR_MAPPING[level] || "odeur";
    return `/markers/${config.basePath}/${signalType}.png`;
  }

  // Vérifier que le niveau est valide
  if (!config.levels.includes(level)) {
    console.warn(
      `Niveau de qualité invalide: ${level} pour la source: ${source}`
    );
    level = config.defaultLevel;
  }

  return `/markers/${config.basePath}_${level}.png`;
}

/**
 * Obtient tous les niveaux disponibles pour une source
 * @param source - Le code de la source
 * @returns Liste des niveaux disponibles
 */
export function getAvailableLevels(source: string): string[] {
  return MARKER_CONFIGS[source]?.levels || [];
}

/**
 * Obtient le niveau par défaut pour une source
 * @param source - Le code de la source
 * @returns Le niveau par défaut
 */
export function getDefaultLevel(source: string): string {
  return MARKER_CONFIGS[source]?.defaultLevel || "default";
}

/**
 * Vérifie si un marqueur existe pour une source et un niveau donnés
 * @param source - Le code de la source
 * @param level - Le niveau de qualité
 * @returns True si le marqueur existe
 */
export function markerExists(source: string, level: string): boolean {
  const config = MARKER_CONFIGS[source];
  if (!config) return false;

  if (source === "signalair") {
    return SIGNAL_AIR_MAPPING.hasOwnProperty(level);
  }

  return config.levels.includes(level);
}
