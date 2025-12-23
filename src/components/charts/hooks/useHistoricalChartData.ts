/**
 * Hook pour gérer les données transformées et la configuration du graphique historique
 */

import { useMemo } from "react";
import { HistoricalDataPoint, StationInfo } from "../../../types";
import { transformData, groupPollutantsByUnit } from "../utils/historicalChartDataTransformers";
import { getCommonThresholds, getXAxisDateFormat, generateSeriesConfigs, SeriesConfig } from "../utils/historicalChartConfig";
import { fallbackColors } from "../utils/historicalChartUtils";

interface UseHistoricalChartDataProps {
  data: Record<string, HistoricalDataPoint[]>;
  selectedPollutants: string[];
  source: string;
  stations: any[];
  isMobile: boolean;
  showRawData: boolean;
  useSolidNebuleAirLines: boolean;
  timeStep?: string;
}

export const useHistoricalChartData = ({
  data,
  selectedPollutants,
  source,
  stations,
  isMobile,
  showRawData,
  useSolidNebuleAirLines,
  timeStep,
}: UseHistoricalChartDataProps) => {
  // Transformer les données pour amCharts
  const chartData = useMemo(() => {
    return transformData(data, selectedPollutants, source, stations, isMobile, timeStep);
  }, [data, selectedPollutants, source, stations, isMobile, timeStep]);

  // Grouper les polluants par unité
  const unitGroups = useMemo(() => {
    const groups = groupPollutantsByUnit(data, selectedPollutants, source, stations);
    return groups;
  }, [selectedPollutants, data, source, stations]);

  const unitKeys = useMemo(() => Object.keys(unitGroups), [unitGroups]);

  // Déterminer le format optimal pour les labels de l'axe X
  const xAxisDateFormat = useMemo(() => {
    return getXAxisDateFormat(chartData, isMobile);
  }, [chartData, isMobile]);

  // Obtenir les seuils communs
  const commonThresholds = useMemo(() => {
    return getCommonThresholds(selectedPollutants, source, stations);
  }, [selectedPollutants, source, stations]);

  // Pré-calculer les données de correction par polluant
  const pollutantDataFlags = useMemo(() => {
    const flags: Record<string, { hasCorrected: boolean; hasRaw: boolean }> = {};
    selectedPollutants.forEach((pollutant) => {
      flags[pollutant] = {
        hasCorrected: chartData.some(
          (point) => point[`${pollutant}_corrected`] !== undefined
        ),
        hasRaw: chartData.some(
          (point) => point[`${pollutant}_raw`] !== undefined
        ),
      };
    });
    return flags;
  }, [selectedPollutants, chartData]);

  // Générer les configurations de séries
  const seriesConfigs = useMemo<SeriesConfig[]>(() => {
    
    const configs = generateSeriesConfigs(
      source,
      stations,
      selectedPollutants,
      unitKeys,
      unitGroups,
      pollutantDataFlags,
      showRawData,
      useSolidNebuleAirLines,
      fallbackColors,
      timeStep,
      chartData
    );

    return configs;
  }, [source, stations, selectedPollutants, unitKeys, unitGroups, pollutantDataFlags, showRawData, useSolidNebuleAirLines, timeStep]);

  // Détecter si des données corrigées sont disponibles (pour AtmoMicro ou en mode comparaison avec stations atmoMicro)
  const hasCorrectedData = useMemo(() => {
    // Mode normal AtmoMicro
    if (source === "atmoMicro") {
      return selectedPollutants.some((pollutant) => {
        return chartData.some(
          (point) => point[`${pollutant}_corrected`] !== undefined
        );
      });
    }
    
    // Mode comparaison : vérifier si au moins une station atmoMicro a des données corrigées
    if (source === "comparison" && stations && stations.length > 0) {
      return stations.some((station) => {
        if (station.source === "atmoMicro") {
          return chartData.some(
            (point) => point[`${station.id}_corrected`] !== undefined
          );
        }
        return false;
      });
    }
    
    return false;
  }, [source, selectedPollutants, chartData, stations]);

  // Transformer les données pour amCharts (timestamp en nombre)
  // IMPORTANT: Préserver les valeurs null pour les gaps
  // Les points null insérés par fillGapsInData doivent être préservés
  const amChartsData = useMemo(() => {
    const transformed = chartData.map((point: any) => {
      let timestamp: number;
      
      // Si le point a déjà un timestamp en nombre (depuis fillGapsInData), l'utiliser
      if (point.timestamp !== undefined && typeof point.timestamp === 'number') {
        timestamp = point.timestamp;
      } else if (point.timestampValue !== undefined) {
        timestamp = point.timestampValue;
      } else if (typeof point.rawTimestamp === 'number') {
        timestamp = point.rawTimestamp;
      } else {
        const rawTs = point.rawTimestamp;
        if (typeof rawTs === "string" && rawTs.includes("T")) {
          if (rawTs.match(/[+-]\d{2}:\d{2}$/)) {
            timestamp = new Date(rawTs).getTime();
          } else if (rawTs.includes("Z")) {
            timestamp = new Date(rawTs).getTime();
          } else {
            timestamp = new Date(rawTs + "Z").getTime();
          }
        } else {
          timestamp = new Date(rawTs).getTime();
        }
      }
      
      // Préserver toutes les propriétés du point, y compris les valeurs null
      return {
        ...point,
        timestamp, // S'assurer que timestamp est toujours un nombre
      };
    });
    
    // Trier par timestamp pour que les gaps soient correctement positionnés
    return transformed.sort((a, b) => a.timestamp - b.timestamp);
  }, [chartData]);

  return {
    chartData,
    amChartsData,
    unitGroups,
    unitKeys,
    xAxisDateFormat,
    commonThresholds,
    seriesConfigs,
    hasCorrectedData,
  };
};

