import { MeasurementDevice, SignalAirReport } from '../types';

/**
 * Interface pour les statistiques globales des appareils
 */
export interface DeviceStatistics {
  // Comptages de base
  totalDevices: number;
  totalReports: number;
  activeDevices: number;
  inactiveDevices: number;

  // Distribution par source
  devicesBySource: Record<string, number>;
  reportsByType: Record<string, number>;

  // Distribution par niveau de qualité
  qualityLevels: Record<string, number>;

  // Statistiques de valeurs
  averageValue: number;
  medianValue: number;
  minValue: number;
  maxValue: number;
  validValuesCount: number;

  // Unité de mesure
  unit: string;
}

/**
 * Interface pour les statistiques détaillées par source
 */
export interface SourceStatistics {
  source: string;
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
  qualityDistribution: Record<string, number>;
  unit: string;
  devices: MeasurementDevice[];
}

/**
 * Interface pour la distribution de qualité ordonnée
 */
export interface QualityDistributionItem {
  level: string;
  count: number;
  percentage: number;
}

/**
 * Calcule la médiane d'un tableau de valeurs
 * @param values - Tableau de valeurs numériques (doit être trié)
 * @returns Valeur médiane
 */
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Calcule toutes les statistiques pour une liste d'appareils
 * OPTIMISATION : Calcul centralisé pour éviter les recalculs dans plusieurs composants
 * 
 * @param devices - Liste des appareils à analyser
 * @param reports - Liste des signalements (optionnel)
 * @returns Statistiques complètes des appareils
 */
export function calculateDeviceStatistics(
  devices: MeasurementDevice[],
  reports: SignalAirReport[] = []
): DeviceStatistics {
  // Comptages de base
  const totalDevices = devices.length;
  const totalReports = reports.length;

  // Filtrer les valeurs valides (supérieures à 0 et non NaN)
  const validDevices = devices.filter(
    (device) => device.value > 0 && !isNaN(device.value)
  );
  const validValues = validDevices.map((device) => device.value);

  // Distribution par source
  const devicesBySource = devices.reduce((acc, device) => {
    acc[device.source] = (acc[device.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Distribution par type de signalement
  const reportsByType = reports.reduce((acc, report) => {
    acc[report.signalType] = (acc[report.signalType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Distribution par niveau de qualité
  const qualityLevels = devices.reduce((acc, device) => {
    const level = device.qualityLevel || 'default';
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Statistiques de valeurs
  const averageValue =
    validValues.length > 0
      ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length
      : 0;

  const medianValue = calculateMedian(validValues);

  const minValue = validValues.length > 0 ? Math.min(...validValues) : 0;
  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;

  // Appareils actifs/inactifs
  const activeDevices = devices.filter(
    (device) => device.status === 'active'
  ).length;
  const inactiveDevices = totalDevices - activeDevices;

  // Unité (prendre la première disponible)
  const unit = devices[0]?.unit || '';

  return {
    totalDevices,
    totalReports,
    activeDevices,
    inactiveDevices,
    devicesBySource,
    reportsByType,
    qualityLevels,
    averageValue,
    medianValue,
    minValue,
    maxValue,
    validValuesCount: validValues.length,
    unit,
  };
}

/**
 * Calcule les statistiques détaillées par source
 * OPTIMISATION : Utilise les données déjà calculées pour éviter les recalculs
 * 
 * @param devices - Liste des appareils groupés par source
 * @returns Statistiques détaillées pour chaque source
 */
export function calculateSourceStatistics(
  devices: MeasurementDevice[]
): SourceStatistics[] {
  // Grouper les appareils par source
  const sourceMap = new Map<string, MeasurementDevice[]>();

  devices.forEach((device) => {
    if (!sourceMap.has(device.source)) {
      sourceMap.set(device.source, []);
    }
    sourceMap.get(device.source)!.push(device);
  });

  // Calculer les statistiques pour chaque source
  return Array.from(sourceMap.entries()).map(([source, sourceDevices]) => {
    // Filtrer les valeurs valides
    const values = sourceDevices
      .map((d) => d.value)
      .filter((v) => v > 0 && !isNaN(v));

    // Distribution par qualité pour cette source
    const qualityDist = sourceDevices.reduce((acc, device) => {
      const level = device.qualityLevel || 'default';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculer les statistiques
    const average =
      values.length > 0
        ? values.reduce((sum, val) => sum + val, 0) / values.length
        : 0;

    const median = calculateMedian(values);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;

    return {
      source,
      devices: sourceDevices,
      count: sourceDevices.length,
      average,
      median,
      min,
      max,
      qualityDistribution: qualityDist,
      unit: sourceDevices[0]?.unit || '',
    };
  });
}

/**
 * Calcule la distribution de qualité ordonnée (pour l'affichage)
 * @param qualityLevels - Distribution brute par niveau
 * @param totalDevices - Nombre total d'appareils
 * @returns Distribution ordonnée avec pourcentages
 */
export function calculateQualityDistribution(
  qualityLevels: Record<string, number>,
  totalDevices: number
): QualityDistributionItem[] {
  // Ordre des niveaux de qualité (du meilleur au pire)
  // "default" sera ajouté en dernier séparément
  const qualityOrder = [
    'bon',
    'moyen',
    'degrade',
    'mauvais',
    'tresMauvais',
    'extrMauvais',
  ];

  // Récupérer les niveaux avec valeurs (sauf default)
  const orderedLevels = qualityOrder
    .filter((level) => qualityLevels[level] > 0)
    .map((level) => ({
      level,
      count: qualityLevels[level],
      percentage: totalDevices > 0 ? (qualityLevels[level] / totalDevices) * 100 : 0,
    }));

  // Ajouter "default" en dernier s'il existe
  if (qualityLevels['default'] > 0) {
    orderedLevels.push({
      level: 'default',
      count: qualityLevels['default'],
      percentage: totalDevices > 0 ? (qualityLevels['default'] / totalDevices) * 100 : 0,
    });
  }

  return orderedLevels;
}
