import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StationInfo,
  ChartControls,
  HistoricalDataPoint,
  SidePanelState,
  NEBULEAIR_POLLUTANT_MAPPING,
} from "../../types";
import { pollutants } from "../../constants/pollutants";
import { NebuleAirService } from "../../services/NebuleAirService";
import HistoricalChart from "../charts/HistoricalChart";
import HistoricalTimeRangeSelector, {
  TimeRange,
  getMaxHistoryDays,
} from "../controls/HistoricalTimeRangeSelector";
import { ToggleGroup, ToggleGroupItem } from "../ui/button-group";
import { cn } from "../../lib/utils";

const NEBULEAIR_TIMESTEP_OPTIONS = [
  "instantane",
  "quartHeure",
  "heure",
  "jour",
] as const;

const getSupportedTimeStepsForPollutants = (
  pollutantCodes: string[]
): string[] => {
  if (!pollutantCodes || pollutantCodes.length === 0) {
    return [...NEBULEAIR_TIMESTEP_OPTIONS];
  }

  return pollutantCodes.reduce<string[]>((acc, code) => {
    const pollutantConfig = pollutants[code];
    if (
      pollutantConfig?.supportedTimeSteps &&
      pollutantConfig.supportedTimeSteps.length > 0
    ) {
      return acc.filter((timeStep) =>
        pollutantConfig.supportedTimeSteps!.includes(timeStep)
      );
    }
    return acc;
  }, [...NEBULEAIR_TIMESTEP_OPTIONS]);
};

const getInitialTimeStepForPollutants = (
  pollutantCodes: string[],
  fallback: string
): string => {
  const supported = getSupportedTimeStepsForPollutants(pollutantCodes);
  if (supported.length === 0) {
    return fallback;
  }
  return supported.includes(fallback) ? fallback : supported[0];
};

interface NebuleAirSidePanelProps {
  isOpen: boolean;
  selectedStation: StationInfo | null;
  onClose: () => void;
  onHidden?: () => void;
  onSizeChange?: (size: "normal" | "fullscreen" | "hidden") => void;
  initialPollutant: string;
  panelSize?: "normal" | "fullscreen" | "hidden";
  onComparisonModeToggle?: () => void;
  isComparisonMode?: boolean;
}

type PanelSize = "normal" | "fullscreen" | "hidden";

const NebuleAirSidePanel: React.FC<NebuleAirSidePanelProps> = ({
  isOpen,
  selectedStation,
  onClose,
  onHidden,
  onSizeChange,
  initialPollutant,
  panelSize: externalPanelSize,
  onComparisonModeToggle,
  isComparisonMode = false,
}) => {
  const initialTimeStep = getInitialTimeStepForPollutants(
    initialPollutant ? [initialPollutant] : [],
    "heure"
  );

  const [state, setState] = useState<SidePanelState>({
    isOpen: false,
    selectedStation: null,
    chartControls: {
      selectedPollutants: [initialPollutant],
      timeRange: {
        type: "preset",
        preset: "24h",
      },
      timeStep: initialTimeStep,
    },
    historicalData: {},
    loading: false,
    error: null,
  });

  const [internalPanelSize, setInternalPanelSize] =
    useState<PanelSize>("normal");
  const [showPollutantsList, setShowPollutantsList] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);
  const initialLoadDoneRef = useRef<string | null>(null);
  const stationIdRef = useRef<string | null>(null);

  // Utiliser la taille externe si fournie, sinon la taille interne
  const currentPanelSize = externalPanelSize || internalPanelSize;

  // Créer le service une seule fois avec useMemo pour éviter les re-renders
  const nebuleAirService = useMemo(() => new NebuleAirService(), []);

  // Fonction utilitaire pour vérifier si un polluant est disponible dans la station
  const isPollutantAvailable = (pollutantCode: string): boolean => {
    return Object.entries(selectedStation?.variables || {}).some(
      ([code, variable]) => {
        return code === pollutantCode && variable.en_service;
      }
    );
  };

  // Fonction utilitaire pour obtenir les polluants disponibles dans la station
  const getAvailablePollutants = (): string[] => {
    if (!selectedStation) return [];

    return Object.entries(pollutants)
      .filter(([pollutantCode]) => {
        return isPollutantAvailable(pollutantCode);
      })
      .map(([pollutantCode]) => pollutantCode);
  };

  const getDateRange = (
    timeRange: TimeRange
  ): { startDate: string; endDate: string } => {
    const now = new Date();
    const endDate = now.toISOString();

    // Si c'est une plage personnalisée, utiliser les dates fournies
    if (timeRange.type === "custom" && timeRange.custom) {
      // Créer les dates en heure LOCALE (sans Z), puis convertir en UTC
      // Cela permet d'avoir 00:00-23:59 en heure locale, pas en UTC
      const startDate = new Date(timeRange.custom.startDate + "T00:00:00");
      const endDate = new Date(timeRange.custom.endDate + "T23:59:59.999");

      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }

    // Sinon, utiliser les périodes prédéfinies
    let startDate: Date;

    switch (timeRange.preset) {
      case "3h":
        startDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        break;
      case "24h":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return {
      startDate: startDate.toISOString(),
      endDate,
    };
  };

  const loadHistoricalData = useCallback(
    async (
      station: StationInfo,
      pollutants: string[],
      timeRange: TimeRange,
      timeStep: string
    ) => {
      console.log("🚀 [NebuleAirSidePanel] Début loadHistoricalData:", {
        station: station.id,
        pollutants,
        timeRange,
        timeStep,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split("\n").slice(1, 4).join("\n"),
      });

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const { startDate, endDate } = getDateRange(timeRange);
        console.log("📅 [NebuleAirSidePanel] Période calculée:", {
          startDate,
          endDate,
        });

        const newHistoricalData: Record<string, HistoricalDataPoint[]> = {};

        // Charger les données pour chaque polluant sélectionné
        for (const pollutant of pollutants) {
          console.log(
            `🔄 [NebuleAirSidePanel] Chargement pour polluant: ${pollutant}`
          );

          const data = await nebuleAirService.fetchHistoricalData({
            sensorId: station.id,
            pollutant,
            timeStep,
            startDate,
            endDate,
          });

          console.log(
            `📊 [NebuleAirSidePanel] Données reçues pour ${pollutant}:`,
            data.length,
            "points"
          );
          newHistoricalData[pollutant] = data;
        }

        console.log(
          "✅ [NebuleAirSidePanel] Toutes les données chargées:",
          newHistoricalData
        );

        setState((prev) => ({
          ...prev,
          historicalData: newHistoricalData,
          loading: false,
        }));

        // Réinitialiser le flag de chargement
        setIsLoading(false);
        loadingRef.current = false;
      } catch (error) {
        console.error(
          "❌ [NebuleAirSidePanel] Erreur lors du chargement des données historiques:",
          error
        );
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Erreur lors du chargement des données historiques",
        }));

        // Réinitialiser le flag de chargement en cas d'erreur
        setIsLoading(false);
        loadingRef.current = false;
      }
    },
    [nebuleAirService]
  );

  // Mettre à jour l'état uniquement lors de l'ouverture du panel ou du changement de station
  useEffect(() => {
    console.log("🔄 [NebuleAirSidePanel] useEffect déclenché:", {
      isOpen,
      selectedStation: selectedStation?.id,
      initialPollutant,
      timestamp: new Date().toISOString(),
    });

    if (!isOpen) {
      // Réinitialiser les références quand le panel est fermé
      stationIdRef.current = null;
      console.log("❌ [NebuleAirSidePanel] Fermeture du panneau");
      setState((prev) => ({
        ...prev,
        isOpen: false,
        selectedStation: null,
        historicalData: {},
        loading: false,
        error: null,
      }));
      setInternalPanelSize("hidden");
      setIsLoading(false);
      loadingRef.current = false;
      initialLoadDoneRef.current = null;
      return;
    }

    if (!selectedStation) return;

    const currentStationId = selectedStation.id;
    const isNewStation = currentStationId !== stationIdRef.current;

    // Initialiser uniquement lors de l'ouverture du panel ou du changement de station
    if (isNewStation) {
      stationIdRef.current = currentStationId;
      
      // Déterminer quels polluants sont disponibles dans cette station
      const availablePollutants = getAvailablePollutants();
      console.log(
        "📊 [NebuleAirSidePanel] Polluants disponibles:",
        availablePollutants
      );

      // Sélectionner le polluant initial s'il est disponible, sinon le premier disponible
      const selectedPollutants = availablePollutants.includes(initialPollutant)
        ? [initialPollutant]
        : availablePollutants.length > 0
        ? [availablePollutants[0]]
        : [];

      console.log(
        "🎯 [NebuleAirSidePanel] Polluants sélectionnés:",
        selectedPollutants
      );

      const nextTimeStep = getInitialTimeStepForPollutants(
        selectedPollutants,
        state.chartControls.timeStep
      );

      // Définir le timeRange initial (24h par défaut)
      const initialTimeRange: TimeRange = {
        type: "preset",
        preset: "24h",
      };

      setState((prev) => ({
        ...prev,
        isOpen,
        selectedStation,
        chartControls: {
          ...prev.chartControls,
          selectedPollutants,
          timeStep: nextTimeStep,
          timeRange: initialTimeRange,
        },
        historicalData: {},
        loading: false,
        error: null,
      }));

      // Réinitialiser la taille du panel
      setInternalPanelSize("normal");
      // Réinitialiser le flag de chargement initial pour la nouvelle station
      initialLoadDoneRef.current = null;

      // Charger les données historiques initiales si des polluants sont disponibles
      // Utiliser setTimeout pour s'assurer que l'état est bien mis à jour
      if (selectedPollutants.length > 0 && !loadingRef.current) {
        const loadKey = `${selectedStation.id}-${selectedPollutants.join(",")}-${initialTimeRange.type === "preset" ? initialTimeRange.preset : "custom"}-${nextTimeStep}`;
        if (initialLoadDoneRef.current !== loadKey) {
          console.log(
            "🚀 [NebuleAirSidePanel] Planification du chargement initial des données historiques",
            {
              selectedPollutants,
              timeRange: initialTimeRange,
              timeStep: nextTimeStep,
              loadKey,
              timestamp: new Date().toISOString(),
            }
          );
          // Utiliser requestAnimationFrame pour s'assurer que le rendu est terminé
          requestAnimationFrame(() => {
            if (!loadingRef.current && initialLoadDoneRef.current !== loadKey) {
              loadingRef.current = true;
              setIsLoading(true);
              initialLoadDoneRef.current = loadKey;
              loadHistoricalData(
                selectedStation,
                selectedPollutants,
                initialTimeRange,
                nextTimeStep
              );
            }
          });
        }
      }
    } else {
      // Si c'est la même station, juste mettre à jour isOpen et selectedStation sans réinitialiser les polluants
      setState((prev) => ({
        ...prev,
        isOpen,
        selectedStation,
      }));
    }
  }, [isOpen, selectedStation, initialPollutant, loadHistoricalData]);

  const handlePollutantToggle = (pollutant: string) => {
    setState((prev) => {
      // Empêcher la désélection du dernier polluant
      if (
        prev.chartControls.selectedPollutants.includes(pollutant) &&
        prev.chartControls.selectedPollutants.length === 1
      ) {
        // Ne rien faire si c'est le dernier polluant sélectionné
        return prev;
      }

      const newSelectedPollutants =
        prev.chartControls.selectedPollutants.includes(pollutant)
          ? prev.chartControls.selectedPollutants.filter((p) => p !== pollutant)
          : [...prev.chartControls.selectedPollutants, pollutant];

      return {
        ...prev,
        chartControls: {
          ...prev.chartControls,
          selectedPollutants: newSelectedPollutants,
        },
      };
    });

    // Recharger les données si le polluant n'était pas encore chargé
    if (selectedStation && !state.historicalData[pollutant]) {
      const { startDate, endDate } = getDateRange(
        state.chartControls.timeRange
      );
      nebuleAirService
        .fetchHistoricalData({
          sensorId: selectedStation.id,
          pollutant,
          timeStep: state.chartControls.timeStep,
          startDate,
          endDate,
        })
        .then((data) => {
          setState((prev) => ({
            ...prev,
            historicalData: {
              ...prev.historicalData,
              [pollutant]: data,
            },
          }));
        });
    }
  };

  const handleTimeRangeChange = (timeRange: TimeRange) => {
    console.log("🔄 [NebuleAirSidePanel] handleTimeRangeChange appelé:", {
      timeRange,
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack?.split("\n").slice(1, 4).join("\n"),
    });

    setState((prev) => {
      // Vérifier et ajuster la période si nécessaire selon le pas de temps actuel
      const { adjustedRange: validatedTimeRange, wasAdjusted } = adjustTimeRangeIfNeeded(
        timeRange,
        prev.chartControls.timeStep
      );

      // Si la période a été ajustée, afficher un message d'information
      let infoMessage: string | null = null;
      if (wasAdjusted) {
        const maxDays = getMaxHistoryDays(prev.chartControls.timeStep);
        if (maxDays) {
          infoMessage = `La période a été automatiquement ajustée à ${maxDays} jours maximum pour le pas de temps sélectionné.`;
          // Faire disparaître le message après 5 secondes
          setTimeout(() => {
            setState((current) => ({
              ...current,
              infoMessage: null,
            }));
          }, 5000);
        }
      }

      // Charger les données avec la période validée
      if (selectedStation) {
        console.log(
          "🚀 [NebuleAirSidePanel] Appel loadHistoricalData depuis handleTimeRangeChange"
        );
        loadHistoricalData(
          selectedStation,
          prev.chartControls.selectedPollutants,
          validatedTimeRange,
          prev.chartControls.timeStep
        );
      }

      return {
        ...prev,
        chartControls: {
          ...prev.chartControls,
          timeRange: validatedTimeRange,
        },
        infoMessage,
      };
    });
  };

  // Vérifier si un pas de temps est valide selon la période actuelle
  const isTimeStepValidForCurrentRange = (timeStep: string): boolean => {
    const maxDays = getMaxHistoryDays(timeStep);
    if (!maxDays) return true; // Pas de limite, toujours valide

    const timeRange = state.chartControls.timeRange;
    let currentDays: number;

    if (timeRange.type === "preset" && timeRange.preset) {
      const presetDays = {
        "3h": 0.125,
        "24h": 1,
        "7d": 7,
        "30d": 30,
      }[timeRange.preset];
      currentDays = presetDays;
    } else if (timeRange.type === "custom" && timeRange.custom) {
      const startDate = new Date(timeRange.custom.startDate);
      const endDate = new Date(timeRange.custom.endDate);
      currentDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    } else {
      return true; // Pas de période définie, considérer comme valide
    }

    return currentDays <= maxDays;
  };

  // Ajuster automatiquement la période si elle dépasse la limite du pas de temps
  const adjustTimeRangeIfNeeded = (
    timeRange: TimeRange,
    timeStep: string
  ): { adjustedRange: TimeRange; wasAdjusted: boolean } => {
    const maxDays = getMaxHistoryDays(timeStep);
    if (!maxDays) return { adjustedRange: timeRange, wasAdjusted: false };

    const now = new Date();
    let adjustedRange = { ...timeRange };
    let wasAdjusted = false;

    if (timeRange.type === "preset" && timeRange.preset) {
      const presetDays = {
        "3h": 0.125,
        "24h": 1,
        "7d": 7,
        "30d": 30,
      }[timeRange.preset];

      if (presetDays > maxDays) {
        // Convertir en période personnalisée limitée
        const maxStartDate = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);
        adjustedRange = {
          type: "custom",
          custom: {
            startDate: maxStartDate.toISOString().split("T")[0],
            endDate: now.toISOString().split("T")[0],
          },
        };
        wasAdjusted = true;
      }
    } else if (timeRange.type === "custom" && timeRange.custom) {
      const startDate = new Date(timeRange.custom.startDate);
      const endDate = new Date(timeRange.custom.endDate);
      const daysDiff = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff > maxDays) {
        const maxStartDate = new Date(endDate.getTime() - maxDays * 24 * 60 * 60 * 1000);
        adjustedRange = {
          type: "custom",
          custom: {
            startDate: maxStartDate.toISOString().split("T")[0],
            endDate: timeRange.custom.endDate,
          },
        };
        wasAdjusted = true;
      }
    }

    return { adjustedRange, wasAdjusted };
  };

  const supportedTimeSteps = useMemo(() => {
    return getSupportedTimeStepsForPollutants(
      state.chartControls.selectedPollutants
    );
  }, [state.chartControls.selectedPollutants]);

  const hasRestrictedTimeSteps =
    supportedTimeSteps.length < NEBULEAIR_TIMESTEP_OPTIONS.length;
  const restrictedPollutants = state.chartControls.selectedPollutants.filter(
    (pollutantCode) =>
      pollutants[pollutantCode]?.supportedTimeSteps &&
      pollutants[pollutantCode]?.supportedTimeSteps!.length > 0 &&
      pollutants[pollutantCode]?.supportedTimeSteps!.length <
        NEBULEAIR_TIMESTEP_OPTIONS.length
  );

  const handleTimeStepChange = (timeStep: string) => {
    console.log("🔄 [NebuleAirSidePanel] handleTimeStepChange appelé:", {
      timeStep,
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack?.split("\n").slice(1, 4).join("\n"),
    });

    if (!supportedTimeSteps.includes(timeStep)) {
      console.log(
        "🚫 [NebuleAirSidePanel] Pas de temps non supporté pour les polluants sélectionnés",
        {
          timeStep,
          supportedTimeSteps,
        }
      );
      return;
    }

    setState((prev) => {
      // Ajuster la période si nécessaire
      const { adjustedRange: adjustedTimeRange, wasAdjusted } = adjustTimeRangeIfNeeded(
        prev.chartControls.timeRange,
        timeStep
      );

      // Si la période a été ajustée, afficher un message d'information
      let infoMessage: string | null = null;
      if (wasAdjusted) {
        const maxDays = getMaxHistoryDays(timeStep);
        if (maxDays) {
          infoMessage = `La période a été automatiquement ajustée à ${maxDays} jours maximum pour le pas de temps sélectionné.`;
          // Faire disparaître le message après 5 secondes
          setTimeout(() => {
            setState((current) => ({
              ...current,
              infoMessage: null,
            }));
          }, 5000);
        }
        console.log(
          `⚠️ [NebuleAirSidePanel] Période ajustée automatiquement de ${prev.chartControls.timeRange} à ${adjustedTimeRange} pour le pas de temps ${timeStep}`
        );
      }

      // Charger les données avec la période ajustée
      if (selectedStation) {
        console.log(
          "🚀 [NebuleAirSidePanel] Appel loadHistoricalData depuis handleTimeStepChange"
        );
        loadHistoricalData(
          selectedStation,
          prev.chartControls.selectedPollutants,
          adjustedTimeRange,
          timeStep
        );
      }

      return {
        ...prev,
        chartControls: {
          ...prev.chartControls,
          timeStep,
          timeRange: adjustedTimeRange,
        },
        infoMessage,
      };
    });
  };

  const handlePanelSizeChange = (newSize: PanelSize) => {
    if (onSizeChange) {
      // Si on a un callback externe, l'utiliser
      onSizeChange(newSize);
    } else {
      // Sinon, utiliser l'état interne
      setInternalPanelSize(newSize);
    }

    if (newSize === "hidden" && onHidden) {
      onHidden();
    }
  };

  if (!isOpen || !selectedStation) {
    return null;
  }

  const availablePollutants = getAvailablePollutants();

  const getPanelClasses = () => {
    const baseClasses =
      "bg-white shadow-xl flex flex-col border-r border-gray-200 transition-all duration-300 h-full md:h-[calc(100vh-64px)] relative z-[1500]";

    switch (currentPanelSize) {
      case "fullscreen":
        return `${baseClasses} w-full`;
      case "hidden":
        // Retirer complètement du flux pour éviter l'espace réservé
        return `${baseClasses} hidden`;
      case "normal":
      default:
        // Responsive: plein écran sur mobile, largeur réduite pour les petits écrans en paysage
        return `${baseClasses} w-full sm:w-[320px] md:w-[400px] lg:w-[600px] xl:w-[650px]`;
    }
  };

  // Fonction pour formater last_seen_sec en date lisible
  const formatLastSeen = (lastSeenSec?: number): string | null => {
    if (lastSeenSec === undefined || lastSeenSec === null) {
      return null;
    }

    const now = new Date();
    const lastSeenDate = new Date(now.getTime() - lastSeenSec * 1000);
    const diffInSeconds = lastSeenSec;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    // Format relatif pour les périodes récentes
    if (diffInMinutes < 1) {
      return `Il y a moins d'une minute`;
    } else if (diffInMinutes < 60) {
      return `Il y a ${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''}`;
    } else if (diffInHours < 24) {
      return `Il y a ${diffInHours} heure${diffInHours > 1 ? 's' : ''}`;
    } else if (diffInDays < 7) {
      return `Il y a ${diffInDays} jour${diffInDays > 1 ? 's' : ''}`;
    } else {
      // Pour les périodes plus longues, afficher la date complète
      return `Dernière émission : ${lastSeenDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`;
    }
  };

  if (!isOpen || !selectedStation) {
    return null;
  }
  console.log(selectedStation);
  return (
    <div className={getPanelClasses()}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {selectedStation.id}, Microcapteur AirCarto
          </h2>
          {selectedStation.lastSeenSec !== undefined && (
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {formatLastSeen(selectedStation.lastSeenSec) || 'Information non disponible'}
            </p>
          )}
        </div>

        {/* Contrôles unifiés du panel */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Bouton agrandir/rétrécir */}
          <button
            onClick={() => 
              handlePanelSizeChange(
                currentPanelSize === "fullscreen" ? "normal" : "fullscreen"
              )
            }
            className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={
              currentPanelSize === "fullscreen" 
                ? "Rétrécir le panel" 
                : "Agrandir le panel"
            }
          >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {currentPanelSize === "fullscreen" ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              )}
            </svg>
          </button>

          {/* Bouton rabattre */}
          <button
            onClick={() => handlePanelSizeChange("hidden")}
            className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Rabattre le panel"
          >
            <svg
              className="w-3.5 h-3.5 sm:w-4 sm:h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Contenu - masqué quand currentPanelSize === 'hidden' */}
      {currentPanelSize !== "hidden" && (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
          {/* Informations station sélectionnée */}
          <div className="border border-gray-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start justify-between space-x-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {selectedStation.name}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  NebuleAir AirCarto{selectedStation.address ? ` · ${selectedStation.address}` : ""}
                </p>
              </div>

              {/* Bouton mode comparaison */}
              {onComparisonModeToggle && (
                <button
                  onClick={onComparisonModeToggle}
                  className={`px-3 py-1.5 rounded-md text-xs transition-all duration-200 flex items-center ${
                    isComparisonMode
                      ? "text-green-700 bg-green-50 border border-green-200"
                      : "text-gray-700 hover:bg-gray-50 border border-gray-200"
                  }`}
                >
                  <svg
                    className="w-3 h-3 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  {isComparisonMode ? "Désactiver comparaison" : "Activer comparaison"}
                </button>
              )}
            </div>
          </div>

          {/* Graphique avec contrôles intégrés */}
          <div className="flex-1 min-h-80 sm:min-h-96 md:min-h-[28rem]">
            <h3 className="text-sm font-medium text-gray-700 mb-2 sm:mb-3">
              Évolution temporelle (NebuleAir)
            </h3>
            {state.loading ? (
              <div className="flex items-center justify-center h-80 sm:h-96 md:h-[28rem] bg-gray-50 rounded-lg">
                <div className="flex flex-col items-center space-y-2">
                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-[#4271B3]"></div>
                  <span className="text-xs sm:text-sm text-gray-500">
                    Chargement des données...
                  </span>
                </div>
              </div>
            ) : state.error ? (
              <div className="flex items-center justify-center h-80 sm:h-96 md:h-[28rem] bg-red-50 rounded-lg">
                <div className="text-center">
                  <svg
                    className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-xs sm:text-sm text-red-600">
                    {state.error}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
                {/* Sélection des polluants - en haut du graphique */}
                <div className="border border-gray-200 rounded-lg mb-3 sm:mb-4">
                  <button
                    onClick={() => setShowPollutantsList(!showPollutantsList)}
                    className="w-full flex items-center justify-between p-2.5 sm:p-3 text-left hover:bg-gray-50 transition-colors rounded-lg"
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <svg
                        className="w-4 h-4 text-gray-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-700 truncate">
                        Polluants affichés
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                        {state.chartControls.selectedPollutants.length}{" "}
                        sélectionné(s)
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                        showPollutantsList ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showPollutantsList && (
                    <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 space-y-1">
                      {Object.entries(pollutants).map(
                        ([pollutantCode, pollutant]) => {
                          // Vérifier si ce polluant est disponible dans la station
                          const isEnabled = isPollutantAvailable(pollutantCode);
                          const isSelected =
                            state.chartControls.selectedPollutants.includes(
                              pollutantCode
                            );
                          const isLastSelectedAndDisabled =
                            isSelected &&
                            state.chartControls.selectedPollutants.length === 1;

                          return (
                            <button
                              key={pollutantCode}
                              onClick={() =>
                                isEnabled &&
                                handlePollutantToggle(pollutantCode)
                              }
                              disabled={!isEnabled || isLastSelectedAndDisabled}
                              title={
                                isLastSelectedAndDisabled
                                  ? "Au moins un polluant doit rester sélectionné"
                                  : !isEnabled
                                  ? "Ce polluant n'est pas disponible pour cette station"
                                  : undefined
                              }
                              className={`w-full flex items-center px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-md text-sm transition-all duration-200 ${
                                !isEnabled
                                  ? "text-gray-400 cursor-not-allowed"
                                  : isLastSelectedAndDisabled
                                  ? "text-[#1f3c6d] bg-[#e7eef8] border border-[#c1d3eb] opacity-70 cursor-not-allowed"
                                  : isSelected
                                  ? "text-[#1f3c6d] bg-[#e7eef8] border border-[#c1d3eb]"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <div
                                className={`w-3 h-3 rounded border mr-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                                  !isEnabled
                                    ? "border-gray-300 bg-gray-100"
                                    : isLastSelectedAndDisabled
                                    ? "bg-[#325a96] border-[#325a96] opacity-60"
                                    : isSelected
                                    ? "bg-[#325a96] border-[#325a96]"
                                    : "border-gray-300"
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    className={`w-2 h-2 ${
                                      isLastSelectedAndDisabled
                                        ? "text-white opacity-60"
                                        : "text-white"
                                    }`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1 text-left truncate">
                                {pollutant.name}
                              </span>
                              {!isEnabled && (
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  Non disponible
                                </span>
                              )}
                            </button>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>

                {/* Message d'information */}
                {state.infoMessage && (
                  <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs sm:text-sm text-amber-800 flex items-start space-x-2">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                    <span className="leading-normal">{state.infoMessage}</span>
                  </div>
                )}

                {/* Graphique */}
                <div className="h-80 sm:h-96 md:h-[28rem] mb-3 sm:mb-4">
                  <HistoricalChart
                    data={state.historicalData}
                    selectedPollutants={state.chartControls.selectedPollutants}
                    source="nebuleAir"
                    stationInfo={selectedStation}
                    timeStep={state.chartControls.timeStep}
                  />
                </div>

                {/* Contrôles du graphique - en bas du graphique */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  {/* Contrôles de la période - Utilisation du composant réutilisable */}
                  <div className="flex-1 border border-gray-200 rounded-lg p-2.5 sm:p-3">
                    <HistoricalTimeRangeSelector
                      timeRange={state.chartControls.timeRange}
                      onTimeRangeChange={handleTimeRangeChange}
                      timeStep={state.chartControls.timeStep}
                    />
                  </div>

                  {/* Contrôles du pas de temps */}
                  <div className="flex-1 border border-gray-200 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-center space-x-2 mb-2.5 sm:mb-3">
                      <svg
                        className="w-4 h-4 text-gray-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">
                        Pas de temps
                      </span>
                    </div>
                    <ToggleGroup
                      type="single"
                      value={state.chartControls.timeStep}
                      onValueChange={(value) => {
                        if (value) {
                          const isDisabledBySupport = !supportedTimeSteps.includes(value);
                          const isDisabledByRange = !isTimeStepValidForCurrentRange(value);
                          if (!isDisabledBySupport && !isDisabledByRange) {
                            handleTimeStepChange(value);
                          }
                        }
                      }}
                      className="w-full"
                    >
                      {[
                        { key: "instantane", label: "Scan" },
                        { key: "quartHeure", label: "15min" },
                        { key: "heure", label: "1h" },
                        { key: "jour", label: "1j" },
                      ].map(({ key, label }) => {
                        const isDisabledBySupport = !supportedTimeSteps.includes(key);
                        const isDisabledByRange = !isTimeStepValidForCurrentRange(key);
                        const isDisabled = isDisabledBySupport || isDisabledByRange;
                        const maxDays = getMaxHistoryDays(key);

                        let tooltip = label;
                        if (isDisabledByRange && maxDays) {
                          tooltip = `Limité à ${maxDays} jours pour ce pas de temps. Réduisez la période historique.`;
                        } else if (isDisabledBySupport) {
                          tooltip = "Pas de temps non supporté pour les polluants sélectionnés";
                        }

                        return (
                          <ToggleGroupItem
                            key={key}
                            value={key}
                            disabled={isDisabled}
                            className={cn(
                              "text-xs min-w-0",
                              isDisabled && "opacity-50"
                            )}
                            title={tooltip}
                          >
                            {label}
                          </ToggleGroupItem>
                        );
                      })}
                    </ToggleGroup>
                    
                    {/* Message explicatif si des boutons sont désactivés à cause de la période */}
                    {(() => {
                      const disabledByRange = [
                        { key: "instantane", label: "Scan" },
                        { key: "quartHeure", label: "15min" },
                        { key: "heure", label: "1h" },
                        { key: "jour", label: "1j" },
                      ].filter(({ key }) => {
                        const isDisabledBySupport = !supportedTimeSteps.includes(key);
                        const isDisabledByRange = !isTimeStepValidForCurrentRange(key);
                        // On ne compte que ceux désactivés par la période, pas par le support
                        return !isDisabledBySupport && isDisabledByRange;
                      });

                      if (disabledByRange.length > 0) {
                        const timeStepLabels = disabledByRange
                          .map(({ key, label }) => {
                            const maxDays = getMaxHistoryDays(key);
                            if (!maxDays) return null;
                            const daysText = maxDays === 60 ? "2 mois" : maxDays === 180 ? "6 mois" : `${maxDays} jours`;
                            return `${label} (max ${daysText})`;
                          })
                          .filter(Boolean);

                        return (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                            <p className="text-[11px] sm:text-xs text-amber-700">
                              <span className="font-medium"></span> Les pas de temps {timeStepLabels.join(" et ")} sont désactivés car la période sélectionnée dépasse leur limite. Réduisez la période historique pour les activer.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    
                    {hasRestrictedTimeSteps && restrictedPollutants.length > 0 && (
                      <p className="mt-2 text-[11px] sm:text-xs text-gray-500">
                        {
                          restrictedPollutants.includes("bruit")
                            ? "Le bruit n'est disponible qu'en mode Scan (≤2 min), les autres pas de temps sont désactivés."
                            : "Certains polluants sélectionnés ne sont pas disponibles pour tous les pas de temps."
                        }
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NebuleAirSidePanel;
