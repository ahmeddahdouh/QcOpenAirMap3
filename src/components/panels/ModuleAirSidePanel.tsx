import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    StationInfo,
    HistoricalDataPoint,
    SidePanelState,
} from "../../types";
import { pollutants } from "../../constants/pollutants";
import { ModuleAirService } from "../../services/ModuleAirService";
import HistoricalChart from "../charts/HistoricalChart";
import HistoricalTimeRangeSelector, {
    TimeRange,
    getMaxHistoryDays,
} from "../controls/HistoricalTimeRangeSelector";
import { ToggleGroup, ToggleGroupItem } from "../ui/button-group";
import { cn } from "../../lib/utils";

const MODULEAIR_TIMESTEP_OPTIONS = [
    "instantane",
    "quartHeure",
    "heure",
    "jour",
] as const;

const getSupportedTimeStepsForPollutants = (
    pollutantCodes: string[]
): string[] => {
    if (!pollutantCodes || pollutantCodes.length === 0) {
        return [...MODULEAIR_TIMESTEP_OPTIONS];
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
    }, [...MODULEAIR_TIMESTEP_OPTIONS]);
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

interface ModuleAirSidePanelProps {
    isOpen: boolean;
    selectedStation: StationInfo | null;
    onClose: () => void;
    onHidden?: () => void;
    onSizeChange?: (size: "normal" | "fullscreen" | "hidden") => void;
    initialPollutant: string;
    panelSize?: "normal" | "fullscreen" | "hidden";
}

type PanelSize = "normal" | "fullscreen" | "hidden";

const ModuleAirSidePanel: React.FC<ModuleAirSidePanelProps> = ({
    isOpen,
    selectedStation,
    onClose,
    onHidden,
    onSizeChange,
    initialPollutant,
    panelSize: externalPanelSize,
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
    const moduleAirService = useMemo(() => new ModuleAirService(), []);

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
            setState((prev) => ({ ...prev, loading: true, error: null }));

            try {
                const { startDate, endDate } = getDateRange(timeRange);
                const newHistoricalData: Record<string, HistoricalDataPoint[]> = {};

                // Charger les données pour chaque polluant sélectionné
                for (const pollutant of pollutants) {
                    const data = await moduleAirService.fetchHistoricalData({
                        sensorId: station.id,
                        pollutant,
                        timeStep,
                        startDate,
                        endDate,
                    });
                    newHistoricalData[pollutant] = data;
                }

                setState((prev) => ({
                    ...prev,
                    historicalData: newHistoricalData,
                    loading: false,
                }));

                setIsLoading(false);
                loadingRef.current = false;
            } catch (error) {
                console.error(
                    "❌ [ModuleAirSidePanel] Erreur lors du chargement des données historiques:",
                    error
                );
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: "Erreur lors du chargement des données historiques",
                }));

                setIsLoading(false);
                loadingRef.current = false;
            }
        },
        [moduleAirService]
    );

    useEffect(() => {
        if (!isOpen) {
            stationIdRef.current = null;
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

        if (isNewStation) {
            stationIdRef.current = currentStationId;

            const availablePollutants = getAvailablePollutants();
            const selectedPollutants = availablePollutants.includes(initialPollutant)
                ? [initialPollutant]
                : availablePollutants.length > 0
                    ? [availablePollutants[0]]
                    : [];

            const nextTimeStep = getInitialTimeStepForPollutants(
                selectedPollutants,
                state.chartControls.timeStep
            );

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

            setInternalPanelSize("normal");
            initialLoadDoneRef.current = null;

            if (selectedPollutants.length > 0 && !loadingRef.current) {
                const loadKey = `${selectedStation.id}-${selectedPollutants.join(",")}-${initialTimeRange.type === "preset" ? initialTimeRange.preset : "custom"}-${nextTimeStep}`;
                if (initialLoadDoneRef.current !== loadKey) {
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
            setState((prev) => ({
                ...prev,
                isOpen,
                selectedStation,
            }));
        }
    }, [isOpen, selectedStation, initialPollutant, loadHistoricalData]);

    const handlePollutantToggle = (pollutant: string) => {
        setState((prev) => {
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

        if (selectedStation && !state.historicalData[pollutant]) {
            const { startDate, endDate } = getDateRange(
                state.chartControls.timeRange
            );
            moduleAirService
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

    const handleTimeRangeChange = (timeRange: TimeRange) => {
        setState((prev) => {
            const { adjustedRange: validatedTimeRange, wasAdjusted } = adjustTimeRangeIfNeeded(
                timeRange,
                prev.chartControls.timeStep
            );

            let infoMessage: string | null = null;
            if (wasAdjusted) {
                const maxDays = getMaxHistoryDays(prev.chartControls.timeStep);
                if (maxDays) {
                    infoMessage = `La période a été automatiquement ajustée à ${maxDays} jours maximum pour le pas de temps sélectionné.`;
                    setTimeout(() => {
                        setState((current) => ({
                            ...current,
                            infoMessage: null,
                        }));
                    }, 5000);
                }
            }

            if (selectedStation) {
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

    const isTimeStepValidForCurrentRange = (timeStep: string): boolean => {
        const maxDays = getMaxHistoryDays(timeStep);
        if (!maxDays) return true;

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
            return true;
        }

        return currentDays <= maxDays;
    };

    const supportedTimeSteps = useMemo(() => {
        return getSupportedTimeStepsForPollutants(
            state.chartControls.selectedPollutants
        );
    }, [state.chartControls.selectedPollutants]);

    const handleTimeStepChange = (timeStep: string) => {
        if (!supportedTimeSteps.includes(timeStep)) return;

        setState((prev) => {
            const { adjustedRange: adjustedTimeRange, wasAdjusted } = adjustTimeRangeIfNeeded(
                prev.chartControls.timeRange,
                timeStep
            );

            let infoMessage: string | null = null;
            if (wasAdjusted) {
                const maxDays = getMaxHistoryDays(timeStep);
                if (maxDays) {
                    infoMessage = `La période a été automatiquement ajustée à ${maxDays} jours maximum pour le pas de temps sélectionné.`;
                    setTimeout(() => {
                        setState((current) => ({
                            ...current,
                            infoMessage: null,
                        }));
                    }, 5000);
                }
            }

            if (selectedStation) {
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
            onSizeChange(newSize);
        } else {
            setInternalPanelSize(newSize);
        }

        if (newSize === "hidden" && onHidden) {
            onHidden();
        }
    };

    if (!isOpen || !selectedStation) return null;

    const currentPanelClasses = () => {
        const baseClasses =
            "bg-white shadow-xl flex flex-col border-r border-gray-200 transition-all duration-300 h-full md:h-[calc(100vh-64px)] relative z-[1500]";

        switch (currentPanelSize) {
            case "fullscreen": return `${baseClasses} w-full`;
            case "hidden": return `${baseClasses} hidden`;
            default: return `${baseClasses} w-full sm:w-[320px] md:w-[400px] lg:w-[600px] xl:w-[650px]`;
        }
    };

    const stats = useMemo(() => {
        const selectedPollutant = state.chartControls.selectedPollutants[0];
        if (!selectedPollutant || !state.historicalData[selectedPollutant]) {
            return null;
        }

        const data = state.historicalData[selectedPollutant];
        if (data.length === 0) return null;

        const values = data.map((d) => d.value).filter((v) => v !== null && !isNaN(v));
        if (values.length === 0) return null;

        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        return { avg, max, min, unit: data[0].unit || pollutants[selectedPollutant]?.unit || "µg/m³" };
    }, [state.historicalData, state.chartControls.selectedPollutants]);

    const formatLastSeen = (lastSeenSec?: number): string | null => {
        if (lastSeenSec === undefined || lastSeenSec === null) return null;
        const now = new Date();
        const lastSeenDate = new Date(now.getTime() - lastSeenSec * 1000);
        const diffInMinutes = Math.floor(lastSeenSec / 60);
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);

        if (diffInMinutes < 1) return `Il y a moins d'une minute`;
        if (diffInMinutes < 60) return `Il y a ${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''}`;
        if (diffInHours < 24) return `Il y a ${diffInHours} heure${diffInHours > 1 ? 's' : ''}`;
        if (diffInDays < 7) return `Il y a ${diffInDays} jour${diffInDays > 1 ? 's' : ''}`;
        return `Dernière émission : ${lastSeenDate.toLocaleDateString()}`;
    };

    return (
        <div className={currentPanelClasses()}>
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                        {selectedStation.name.replace("_", " ")}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
                        {selectedStation.address || "ModuleAir"}
                        {selectedStation.lastSeenSec !== undefined && ` · ${formatLastSeen(selectedStation.lastSeenSec)}`}
                    </p>
                </div>
                <div className="flex items-center space-x-1 sm:space-x-2">
                    <button
                        onClick={() => handlePanelSizeChange(currentPanelSize === "fullscreen" ? "normal" : "fullscreen")}
                        className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {currentPanelSize === "fullscreen" ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            )}
                        </svg>
                    </button>
                    <button onClick={() => handlePanelSizeChange("hidden")} className="p-1.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
                <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Évolution temporelle (ModuleAir)</h3>
                    {state.loading ? (
                        <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4271B3]"></div>
                        </div>
                    ) : state.error ? (
                        <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">{state.error}</div>
                    ) : (
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="border border-gray-200 rounded-lg mb-3">
                                <button
                                    onClick={() => setShowPollutantsList(!showPollutantsList)}
                                    className="w-full flex items-center justify-between p-2 text-sm font-medium text-gray-700"
                                >
                                    <span>Polluants affichés ({state.chartControls.selectedPollutants.length})</span>
                                    <svg className={`w-4 h-4 transition-transform ${showPollutantsList ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showPollutantsList && (
                                    <div className="p-2 space-y-1">
                                        {Object.entries(pollutants).map(([code, p]) => {
                                            const isEnabled = isPollutantAvailable(code);
                                            const isSelected = state.chartControls.selectedPollutants.includes(code);
                                            return (
                                                <button
                                                    key={code}
                                                    onClick={() => isEnabled && handlePollutantToggle(code)}
                                                    disabled={!isEnabled}
                                                    className={`w-full text-left px-2 py-1.5 rounded text-sm ${!isEnabled ? 'text-gray-300' : isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}
                                                >
                                                    {p.name} {!isEnabled && "(N/A)"}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="h-80 mb-4">
                                <HistoricalChart
                                    data={state.historicalData}
                                    selectedPollutants={state.chartControls.selectedPollutants}
                                    source="moduleair"
                                    stationInfo={selectedStation}
                                    timeStep={state.chartControls.timeStep}
                                />
                            </div>

                            <div className="space-y-4">
                                <HistoricalTimeRangeSelector
                                    timeRange={state.chartControls.timeRange}
                                    onTimeRangeChange={handleTimeRangeChange}
                                    timeStep={state.chartControls.timeStep}
                                />
                                <div className="border-t pt-4">
                                    <span className="text-xs font-medium text-gray-500 uppercase block mb-2">Pas de temps</span>
                                    <ToggleGroup
                                        type="single"
                                        value={state.chartControls.timeStep}
                                        onValueChange={(v) => v && handleTimeStepChange(v)}
                                        className="justify-start"
                                    >
                                        {[
                                            { key: "instantane", label: "Scan" },
                                            { key: "quartHeure", label: "15m" },
                                            { key: "heure", label: "1h" },
                                            { key: "jour", label: "1j" },
                                        ].map(({ key, label }) => (
                                            <ToggleGroupItem
                                                key={key}
                                                value={key}
                                                disabled={!supportedTimeSteps.includes(key) || !isTimeStepValidForCurrentRange(key)}
                                                className="text-xs px-3"
                                            >
                                                {label}
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                </div>
                            </div>

                            {/* Statistiques Section */}
                            {stats && (
                                <div className="mt-6 border-t pt-4">
                                    <h3 className="text-sm font-medium text-gray-700 mb-3 text-center">
                                        Statistiques ({pollutants[state.chartControls.selectedPollutants[0]]?.name})
                                    </h3>
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div className="text-center">
                                            <span className="text-gray-600 block text-xs">Moyenne</span>
                                            <p className="font-semibold text-base text-blue-600">
                                                {stats.avg.toFixed(1)}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                                {stats.unit}
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <span className="text-gray-600 block text-xs">Maximum</span>
                                            <p className="font-semibold text-base text-red-600">
                                                {stats.max.toFixed(1)}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                                {stats.unit}
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <span className="text-gray-600 block text-xs">Minimum</span>
                                            <p className="font-semibold text-base text-green-600">
                                                {stats.min.toFixed(1)}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                                {stats.unit}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModuleAirSidePanel;
