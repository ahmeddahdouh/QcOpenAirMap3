/**
 * Transformateurs de données pour HistoricalChart
 */

import { HistoricalDataPoint } from "../../../types";
import { pollutants } from "../../../constants/pollutants";
import { encodeUnit, ensureNonNegativeValue } from "./historicalChartUtils";

/**
 * Normalise un timestamp en millisecondes UTC
 */
export const normalizeTimestamp = (ts: string | number): number => {
  if (typeof ts === "number") return ts;
  if (typeof ts === "string" && ts.includes("T")) {
    // Format ISO : peut contenir Z, +00:00, -05:00, etc.
    if (ts.match(/[+-]\d{2}:\d{2}$/)) {
      // Format avec offset de fuseau horaire
      return new Date(ts).getTime();
    } else if (ts.includes("Z")) {
      // Format ISO UTC avec Z
      return new Date(ts).getTime();
    } else {
      // Format ISO sans Z ni offset : traiter comme UTC
      return new Date(ts + "Z").getTime();
    }
  }
  return new Date(ts).getTime();
};

/**
 * Formate un timestamp pour l'affichage
 */
export const formatTimestamp = (timestamp: string | number, isMobile: boolean): string => {
  let dateMs: number;
  
  if (typeof timestamp === "number") {
    dateMs = timestamp;
  } else {
    dateMs = normalizeTimestamp(timestamp);
  }
  
  const date = new Date(dateMs);
  // Format plus court sur mobile uniquement
  return isMobile
    ? `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}h`
    : date.toLocaleString("fr-FR", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/**
 * Calcule l'intervalle en millisecondes pour un pas de temps donné
 */
const getTimeStepInterval = (timeStep: string): number | null => {
  const intervals: Record<string, number> = {
    quartHeure: 15 * 60 * 1000, // 15 minutes en millisecondes
    heure: 60 * 60 * 1000, // 1 heure en millisecondes
    jour: 24 * 60 * 60 * 1000, // 1 jour en millisecondes
  };
  return intervals[timeStep] || null;
};

/**
 * Arrondit un timestamp au pas de temps le plus proche
 */
const roundToTimeStep = (timestamp: number, interval: number): number => {
  return Math.floor(timestamp / interval) * interval;
};

/**
 * Génère tous les timestamps attendus entre le premier et le dernier point pour un pas de temps agrégé
 */
const generateExpectedTimestamps = (
  firstTimestamp: number,
  lastTimestamp: number,
  interval: number
): number[] => {
  const timestamps: number[] = [];
  let current = roundToTimeStep(firstTimestamp, interval);
  const last = roundToTimeStep(lastTimestamp, interval);
  
  while (current <= last) {
    timestamps.push(current);
    current += interval;
  }
  
  return timestamps;
};

/**
 * Détecte les gaps dans les données et insère des valeurs null pour les timestamps manquants
 * Uniquement pour les pas de temps agrégés (15min, 1h, 1j)
 * 
 * Selon la doc amCharts 5:
 * - Les données doivent contenir des valeurs null aux emplacements où les gaps doivent apparaître
 * - Avec connect: false, amCharts ne connectera pas les points null, créant des gaps visuels
 * - Les timestamps doivent être des nombres (millisecondes depuis epoch)
 */
export const fillGapsInData = (
  data: any[],
  timeStep?: string
): any[] => {
  // Ne traiter que les pas de temps agrégés
  if (!timeStep || !["quartHeure", "heure", "jour"].includes(timeStep)) {
    return data;
  }

  const interval = getTimeStepInterval(timeStep);
  if (!interval || data.length === 0) {
    return data;
  }

  // S'assurer que les données sont triées par timestamp
  const sortedData = [...data].sort((a, b) => {
    const tsA = a.timestampValue !== undefined ? a.timestampValue : normalizeTimestamp(a.rawTimestamp);
    const tsB = b.timestampValue !== undefined ? b.timestampValue : normalizeTimestamp(b.rawTimestamp);
    return tsA - tsB;
  });

  const firstTimestamp = sortedData[0].timestampValue !== undefined 
    ? sortedData[0].timestampValue 
    : normalizeTimestamp(sortedData[0].rawTimestamp);
  const lastTimestamp = sortedData[sortedData.length - 1].timestampValue !== undefined
    ? sortedData[sortedData.length - 1].timestampValue
    : normalizeTimestamp(sortedData[sortedData.length - 1].rawTimestamp);

  // Générer tous les timestamps attendus
  const expectedTimestamps = generateExpectedTimestamps(
    firstTimestamp,
    lastTimestamp,
    interval
  );

  // Créer une map des données existantes par timestamp arrondi
  const dataMap = new Map<number, any>();
  sortedData.forEach((point) => {
    const ts = point.timestampValue !== undefined 
      ? point.timestampValue 
      : normalizeTimestamp(point.rawTimestamp);
    const roundedTs = roundToTimeStep(ts, interval);
    if (!dataMap.has(roundedTs)) {
      dataMap.set(roundedTs, point);
    }
  });

  // Identifier toutes les clés de données (polluants, stations, etc.) présentes dans les données
  const allDataKeys = new Set<string>();
  sortedData.forEach((point) => {
    Object.keys(point).forEach((key) => {
      if (!["timestamp", "rawTimestamp", "timestampValue"].includes(key) && !key.endsWith("_unit")) {
        allDataKeys.add(key);
      }
    });
  });

  // Construire le tableau final avec les gaps remplis
  // Selon la doc amCharts: insérer des valeurs null pour créer des gaps avec connect: false
  const filledData: any[] = [];
  expectedTimestamps.forEach((expectedTs) => {
    const existingPoint = dataMap.get(expectedTs);
    
    if (existingPoint) {
      filledData.push(existingPoint);
    } else {
      // Gap détecté : créer un point avec des valeurs null
      // Selon la doc amCharts, les valeurs null créent des gaps avec connect: false
      const date = new Date(expectedTs);
      const gapPoint: any = {
        timestamp: expectedTs, // Timestamp en nombre (millisecondes) pour amCharts DateAxis
        rawTimestamp: date.toISOString(),
        timestampValue: expectedTs,
      };

      // Ajouter null pour chaque série
      // IMPORTANT: Utiliser null (pas undefined) car amCharts détecte mieux null
      // Mais si connect: false ne fonctionne pas, essayer undefined
      allDataKeys.forEach((key) => {
        gapPoint[key] = null; // null est la valeur standard pour les gaps selon la doc
      });

      // Préserver les unités
      if (sortedData.length > 0) {
        const samplePoint = sortedData[0];
        Object.keys(samplePoint).forEach((key) => {
          if (key.endsWith("_unit")) {
            gapPoint[key] = samplePoint[key];
          }
        });
      }

      filledData.push(gapPoint);
    }
  });

  return filledData;
};

/**
 * Transforme les données pour le mode comparaison
 */
export const transformComparisonData = (
  data: Record<string, HistoricalDataPoint[]>,
  stations: any[],
  selectedPollutants: string[],
  isMobile: boolean,
  timeStep?: string
): any[] => {
  const allTimestamps = new Map<number, string>(); // Map timestamp numérique -> string original
  const pollutant = selectedPollutants[0]; // Un seul polluant en mode comparaison

  // Récupérer tous les timestamps uniques de toutes les stations
  stations.forEach((station) => {
    if (data[station.id]) {
      data[station.id].forEach((point) => {
        const timestampMs = normalizeTimestamp(point.timestamp);
        if (!allTimestamps.has(timestampMs)) {
          allTimestamps.set(timestampMs, point.timestamp);
        }
      });
    }
  });

  // Trier les timestamps numériques
  const sortedTimestamps = Array.from(allTimestamps.entries()).sort(
    (a, b) => a[0] - b[0]
  );

  // Créer les points de données
  const transformedData = sortedTimestamps.map(([timestampMs, originalTimestamp]) => {
    const date = new Date(timestampMs);
    const timestamp = formatTimestamp(originalTimestamp, isMobile);
    
    const point: any = {
      timestamp,
      rawTimestamp: originalTimestamp,
      timestampValue: timestampMs,
    };

    // Ajouter les valeurs pour chaque station
    stations.forEach((station) => {
      if (data[station.id]) {
        const dataPoint = data[station.id].find(
          (p) => normalizeTimestamp(p.timestamp) === timestampMs
        );
        if (dataPoint) {
          // Pour les stations atmoMicro, gérer les données corrigées et brutes
          if (station.source === "atmoMicro") {
            // Valeur corrigée si disponible
            if (dataPoint.corrected_value !== undefined) {
              point[`${station.id}_corrected`] = ensureNonNegativeValue(dataPoint.corrected_value);
            }
            // Valeur brute
            if (dataPoint.raw_value !== undefined) {
              point[`${station.id}_raw`] = ensureNonNegativeValue(dataPoint.raw_value);
            }
            // Valeur principale : utiliser corrigée si disponible, sinon brute
            if (dataPoint.corrected_value !== undefined) {
              point[station.id] = ensureNonNegativeValue(dataPoint.corrected_value);
            } else if (dataPoint.raw_value !== undefined) {
              point[station.id] = ensureNonNegativeValue(dataPoint.raw_value);
            } else {
              point[station.id] = ensureNonNegativeValue(dataPoint.value);
            }
          } else {
            // Pour les autres sources (atmoRef, etc.), utiliser simplement value
            point[station.id] = ensureNonNegativeValue(dataPoint.value);
          }
          
          let unit = dataPoint.unit;
          if (!unit && pollutants[pollutant]) {
            unit = pollutants[pollutant].unit;
          }
          point[`${station.id}_unit`] = unit;
        }
      }
    });

    return point;
  });

  // Remplir les gaps pour les pas de temps agrégés
  return fillGapsInData(transformedData, timeStep);
};

/**
 * Transforme les données pour le mode normal
 */
export const transformNormalData = (
  data: Record<string, HistoricalDataPoint[]>,
  selectedPollutants: string[],
  source: string,
  isMobile: boolean,
  timeStep?: string
): any[] => {
  // Récupérer tous les timestamps uniques
  const allTimestamps = new Set<string>();
  selectedPollutants.forEach((pollutant) => {
    if (data[pollutant]) {
      data[pollutant].forEach((point) => {
        allTimestamps.add(point.timestamp);
      });
    }
  });

  // Trier les timestamps en les convertissant en dates pour un tri correct
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => {
    return normalizeTimestamp(a) - normalizeTimestamp(b);
  });

  // Créer les points de données
  const transformedData = sortedTimestamps.map((timestamp) => {
    const dateMs = normalizeTimestamp(timestamp);
    const timestampFormatted = formatTimestamp(timestamp, isMobile);
    
    const point: any = {
      timestamp: timestampFormatted,
      rawTimestamp: timestamp,
      timestampValue: dateMs,
    };

    // Ajouter les valeurs pour chaque polluant (corrigées et brutes)
    selectedPollutants.forEach((pollutant) => {
      if (data[pollutant]) {
        const timestampMs = normalizeTimestamp(timestamp);
        
        const dataPoint = data[pollutant].find((p) => {
          const pTimestampMs = normalizeTimestamp(p.timestamp);
          // Comparer en millisecondes pour éviter les problèmes de format
          return Math.abs(pTimestampMs - timestampMs) < 1000; // Tolérance de 1 seconde
        });
        
        if (dataPoint) {
          // Valeur corrigée si disponible
          if (dataPoint.corrected_value !== undefined) {
            point[`${pollutant}_corrected`] = ensureNonNegativeValue(dataPoint.corrected_value);
          }

          // Valeur brute
          if (dataPoint.raw_value !== undefined) {
            point[`${pollutant}_raw`] = ensureNonNegativeValue(dataPoint.raw_value);
          }

          // Valeur principale : pour AtmoMicro avec données corrigées, utiliser _corrected
          if (source === "atmoMicro") {
            if (dataPoint.corrected_value === undefined) {
              point[`${pollutant}_raw`] = ensureNonNegativeValue(dataPoint.value);
            }
          } else {
            point[pollutant] = ensureNonNegativeValue(dataPoint.value);
          }

          // Stocker l'unité pour ce polluant
          let unit = dataPoint.unit;
          if (!unit && pollutants[pollutant]) {
            unit = pollutants[pollutant].unit;
          }
          point[`${pollutant}_unit`] = unit;
        }
      }
    });

    return point;
  });

  // Remplir les gaps pour les pas de temps agrégés
  return fillGapsInData(transformedData, timeStep);
};

/**
 * Transforme les données pour amCharts
 */
export const transformData = (
  data: Record<string, HistoricalDataPoint[]>,
  selectedPollutants: string[],
  source: string,
  stations: any[],
  isMobile: boolean,
  timeStep?: string
): any[] => {
  if (selectedPollutants.length === 0) return [];

  // Mode comparaison : données par station
  if (source === "comparison" && stations.length > 0) {
    return transformComparisonData(data, stations, selectedPollutants, isMobile, timeStep);
  }

  // Mode normal : données par polluant
  return transformNormalData(data, selectedPollutants, source, isMobile, timeStep);
};

/**
 * Groupe les polluants par unité
 */
export const groupPollutantsByUnit = (
  data: Record<string, HistoricalDataPoint[]>,
  selectedPollutants: string[],
  source: string,
  stations: any[]
): Record<string, string[]> => {
  const unitGroups: Record<string, string[]> = {};

  // Mode comparaison : les données sont groupées par station ID
  if (source === "comparison" && stations.length > 0) {
    const pollutant = selectedPollutants[0];
    for (const station of stations) {
      if (data[station.id] && data[station.id].length > 0) {
        const unit = encodeUnit(data[station.id][0].unit);
        if (!unitGroups[unit]) {
          unitGroups[unit] = [];
        }
        if (!unitGroups[unit].includes(pollutant)) {
          unitGroups[unit].push(pollutant);
        }
        break;
      }
    }
  } else {
    // Mode normal : les données sont groupées par polluant
    selectedPollutants.forEach((pollutant) => {
      if (data[pollutant] && data[pollutant].length > 0) {
        const unit = encodeUnit(data[pollutant][0].unit);
        if (!unitGroups[unit]) {
          unitGroups[unit] = [];
        }
        unitGroups[unit].push(pollutant);
      }
    });
  }

  return unitGroups;
};

