import { useState, useEffect, useCallback, useRef } from "react";
import { MeasurementDevice, SignalAirReport } from "../types";
import { DataServiceFactory } from "../services/DataServiceFactory";
import { pasDeTemps } from "../constants/timeSteps";

interface UseAirQualityDataProps {
  selectedPollutant: string;
  selectedSources: string[];
  selectedTimeStep: string;
  signalAirPeriod?: { startDate: string; endDate: string };
  mobileAirPeriod?: { startDate: string; endDate: string };
  selectedMobileAirSensor?: string | null;
  signalAirOptions?: {
    selectedTypes: string[];
    loadTrigger: number;
    isSourceSelected?: boolean;
  };
  autoRefreshEnabled?: boolean;
}

// Correction : utiliser le code réel du pas de temps
const getRefreshInterval = (timeStep: string): number => {
  const code = pasDeTemps[timeStep]?.code || timeStep;
  switch (code) {
    case "instantane": // Scan
    case "2min": // ≤ 2 minutes
      return 60 * 1000; // 60 secondes
    case "qh": // 15 minutes
      return 15 * 60 * 1000; // 15 minutes
    case "h": // Heure
      return 60 * 60 * 1000; // 60 minutes
    case "d": // Jour
      return 24 * 60 * 60 * 1000; // 24 heures
    default:
      return 60 * 1000; // Par défaut, 60 secondes
  }
};

export const useAirQualityData = ({
  selectedPollutant,
  selectedSources,
  selectedTimeStep,
  signalAirPeriod,
  mobileAirPeriod,
  selectedMobileAirSensor,
  signalAirOptions,
  autoRefreshEnabled = true,
}: UseAirQualityDataProps) => {
  const [devices, setDevices] = useState<MeasurementDevice[]>([]);
  const [reports, setReports] = useState<SignalAirReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Référence pour stocker l'intervalle
  const intervalRef = useRef<number | null>(null);
  const signalAirLastTriggerRef = useRef(0);

  const fetchData = useCallback(async () => {
    const now = new Date();
    setLastRefresh(now);

    try {
      // Mapper les sources communautaires vers leurs codes de service réels
      const mappedSources = selectedSources.map((source) => {
        if (source.startsWith("communautaire.")) {
          return source.split(".")[1]; // Extraire 'nebuleair' de 'communautaire.nebuleair'
        }
        return source;
      });

      if (selectedSources.length === 0) {
        setDevices([]);
        setReports([]);
        setLoading(false);
        setLoadingSources([]);
        return;
      }

      const isSignalAirSourceSelected =
        signalAirOptions?.isSourceSelected ?? mappedSources.includes("signalair");
      let shouldFetchSignalAir =
        isSignalAirSourceSelected &&
        signalAirOptions &&
        signalAirOptions.loadTrigger > signalAirLastTriggerRef.current;

      if (!isSignalAirSourceSelected) {
        setReports([]);
      } else if (!shouldFetchSignalAir) {
        setReports((prevReports) =>
          prevReports.length > 0
            ? prevReports.filter((report) => report.source !== "signalair")
            : prevReports
        );
      } else {
        // L'utilisateur vient de demander un chargement explicite
        setReports((prevReports) =>
          prevReports.length > 0
            ? prevReports.filter((report) => report.source !== "signalair")
            : prevReports
        );
      }

      // Indices des sources à réellement charger (on saute SignalAir tant que l'utilisateur n'a pas demandé)
      const fetchableIndexes = mappedSources.reduce<number[]>(
        (indexes, mappedSource, index) => {
          if (mappedSource === "signalair" && !shouldFetchSignalAir) {
            return indexes;
          }
          indexes.push(index);
          return indexes;
        },
        []
      );

      const fetchableSources = fetchableIndexes.map(
        (index) => selectedSources[index]
      );

      // NETTOYER LES ROUTES ET DEVICES MOBILEAIR EN PREMIER, AVANT TOUTE AUTRE OPÉRATION
      // Cela garantit que le nettoyage se fait au bon moment, même lors d'un rechargement
      if (selectedSources.includes("communautaire.mobileair") && selectedMobileAirSensor) {
        // Nettoyer les routes dans le service MobileAir en PREMIER
        try {
          const mobileAirService = DataServiceFactory.getService("mobileair") as any;
          if (mobileAirService && typeof mobileAirService.clearRoutes === "function") {
            mobileAirService.clearRoutes();
          }
        } catch (error) {
          console.error("Erreur lors du nettoyage des routes MobileAir:", error);
        }
        
        // Nettoyer les devices MobileAir en PREMIER (utiliser callback pour garantir l'état actuel)
        setDevices((prevDevices) => {
          const hasMobileAirDevices = prevDevices.some((d) => d.source === "mobileair");
          
          if (hasMobileAirDevices) {
            const filteredDevices = prevDevices.filter((device) => {
              return device.source !== "mobileair";
            });
            
            return filteredDevices;
          }
          
          return prevDevices;
        });
      }

      // Réinitialiser les devices avant de recharger de nouvelles données
      // MAIS seulement si on ne recharge pas juste MobileAir (pour garder les autres sources)
      if (!(selectedSources.includes("communautaire.mobileair") && selectedMobileAirSensor)) {
        setDevices([]);
      }

      if (fetchableSources.length === 0) {
        setLoading(false);
        setLoadingSources([]);
        return;
      }

      setLoading(true);
      setError(null);
      setLoadingSources(fetchableSources);

      // console.log("🔍 [HOOK] Mapping des sources:", {
      //   selectedSources,
      //   mappedSources,
      // });

      // Récupérer les services pour chaque source sélectionnée
      const services = DataServiceFactory.getServices(mappedSources);
      // console.log(
      //   "🔍 [HOOK] Services récupérés:",
      //   services.map((s) => s.constructor.name)
      // );

      // Nettoyer les devices des sources non sélectionnées
      setDevices((prevDevices) => {
        const filteredDevices = prevDevices.filter((device) => {
          // Garder les devices des sources actuellement sélectionnées
          return mappedSources.includes(device.source);
        });

        // console.log("🧹 [HOOK] Nettoyage des devices:", {
        //   totalDevices: prevDevices.length,
        //   filteredDevices: filteredDevices.length,
        //   selectedSources: selectedSources,
        //   mappedSources: mappedSources,
        //   removedDevices: prevDevices
        //     .filter((d) => !mappedSources.includes(d.source))
        //     .map((d) => ({ id: d.id, source: d.source })),
        // });

        return filteredDevices;
      });

      // Supprimer explicitement les devices MobileAir si MobileAir n'est pas sélectionné
      if (!selectedSources.includes("communautaire.mobileair")) {
        setDevices((prevDevices) => {
          const filteredDevices = prevDevices.filter((device) => {
            return device.source !== "mobileair";
          });

          return filteredDevices;
        });
      }


      // Traiter chaque service individuellement pour un affichage progressif
      for (const index of fetchableIndexes) {
        const service = services[index];
        const sourceCode = selectedSources[index]; // Code original pour l'affichage
        const mappedSourceCode = mappedSources[index]; // Code réel du service

        try {
          const data = await service.fetchData({
            pollutant: selectedPollutant,
            timeStep: selectedTimeStep,
            sources: mappedSources, // Utiliser les sources mappées, pas les sources originales
            signalAirPeriod,
            signalAirSelectedTypes: signalAirOptions?.selectedTypes,
            mobileAirPeriod,
            selectedSensors: selectedMobileAirSensor
              ? [selectedMobileAirSensor]
              : [],
          });

          // Séparer les appareils de mesure des signalements
          if (Array.isArray(data)) {
            const measurementDevices: MeasurementDevice[] = [];
            const signalReports: SignalAirReport[] = [];

            data.forEach((item) => {
              if ("pollutant" in item && "value" in item && "unit" in item) {
                // C'est un appareil de mesure
                measurementDevices.push(item as MeasurementDevice);
              } else if ("signalType" in item) {
                // C'est un signalement
                signalReports.push(item as SignalAirReport);
              }
            });

            // Mettre à jour les appareils de mesure
            if (measurementDevices.length > 0) {
              setDevices((prevDevices) => {
                // Filtrer les anciennes données de cette source
                const filteredDevices = prevDevices.filter(
                  (device) => device.source !== mappedSourceCode
                );
                // Ajouter les nouvelles données
                return [...filteredDevices, ...measurementDevices];
              });
            }

            // Mettre à jour les signalements (uniquement pour SignalAir)
            if (mappedSourceCode === "signalair") {
              setReports((prevReports) => {
                const filteredReports = prevReports.filter(
                  (report) => report.source !== mappedSourceCode
                );
                if (signalReports.length === 0) {
                  return filteredReports;
                }
                return [...filteredReports, ...signalReports];
              });
            } else if (signalReports.length > 0) {
              setReports((prevReports) => {
                const filteredReports = prevReports.filter(
                  (report) => report.source !== mappedSourceCode
                );
                return [...filteredReports, ...signalReports];
              });
            }
          }
        } catch (err) {
          console.error(
            `❌ Erreur lors de la récupération des données pour ${sourceCode}:`,
            err
          );

          // En cas d'erreur, on garde les données existantes mais on retire la source du loading
        } finally {
          // Retirer cette source de la liste des sources en cours
          setLoadingSources((prev) =>
            prev.filter((source) => source !== sourceCode)
          );
        }
      }

      if (shouldFetchSignalAir && signalAirOptions) {
        signalAirLastTriggerRef.current = signalAirOptions.loadTrigger;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de la récupération des données"
      );
    } finally {
      setLoading(false);
    }
  }, [
    selectedPollutant,
    selectedSources,
    selectedTimeStep,
    signalAirPeriod,
    mobileAirPeriod,
    selectedMobileAirSensor,
    signalAirOptions,
  ]);

  // Effet pour gérer l'auto-refresh
  useEffect(() => {
    // Nettoyer l'intervalle précédent s'il existe
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Ne pas démarrer l'auto-refresh si désactivé ou aucune source sélectionnée
    if (!autoRefreshEnabled || selectedSources.length === 0) {
      return;
    }

    // Récupérer l'intervalle de rafraîchissement selon le pas de temps
    const refreshInterval = getRefreshInterval(selectedTimeStep);

    // Démarrer l'intervalle d'auto-refresh
    intervalRef.current = setInterval(() => {
      fetchData();
    }, refreshInterval) as any;

    // Nettoyer l'intervalle lors du démontage du composant
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedTimeStep, selectedSources, autoRefreshEnabled, fetchData]);

  // Effet pour le chargement initial
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    devices,
    reports,
    loading,
    error,
    loadingSources,
    lastRefresh,
  };
};
