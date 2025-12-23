import { useState, useEffect, useCallback } from "react";
import {
  MobileAirRoute,
  MobileAirDataPoint,
  MeasurementDevice,
} from "../../../types";
import { DataServiceFactory } from "../../../services/DataServiceFactory";
import { MobileAirService } from "../../../services/MobileAirService";
import L from "leaflet";

interface UseMobileAirProps {
  selectedSources: string[];
  devices: MeasurementDevice[];
  mapRef: React.RefObject<L.Map | null>;
  onMobileAirSensorSelected?: (
    sensorId: string,
    period: { startDate: string; endDate: string }
  ) => void;
}

export const useMobileAir = ({
  selectedSources,
  devices,
  mapRef,
  onMobileAirSensorSelected,
}: UseMobileAirProps) => {
  const [mobileAirRoutes, setMobileAirRoutes] = useState<MobileAirRoute[]>([]);
  const [isMobileAirSelectionPanelOpen, setIsMobileAirSelectionPanelOpen] =
    useState(false);
  const [mobileAirSelectionPanelSize, setMobileAirSelectionPanelSize] =
    useState<"normal" | "fullscreen" | "hidden">("normal");
  const [isMobileAirDetailPanelOpen, setIsMobileAirDetailPanelOpen] =
    useState(false);
  const [mobileAirDetailPanelSize, setMobileAirDetailPanelSize] = useState<
    "normal" | "fullscreen" | "hidden"
  >("normal");
  const [selectedMobileAirRoute, setSelectedMobileAirRoute] =
    useState<MobileAirRoute | null>(null);
  const [hoveredMobileAirPoint, setHoveredMobileAirPoint] =
    useState<MobileAirDataPoint | null>(null);
  const [highlightedMobileAirPoint, setHighlightedMobileAirPoint] =
    useState<MobileAirDataPoint | null>(null);
  const [activeMobileAirRoute, setActiveMobileAirRoute] =
    useState<MobileAirRoute | null>(null);
  const [userClosedSelectionPanel, setUserClosedSelectionPanel] =
    useState(false);
  const [userClosedDetailPanel, setUserClosedDetailPanel] = useState(false);
  const [forceNewChoice, setForceNewChoice] = useState(false);

  // Effet pour extraire les routes MobileAir des devices
  useEffect(() => {
    const isMobileAirSelected = selectedSources.includes(
      "communautaire.mobileair"
    );

    if (!isMobileAirSelected) {
      setMobileAirRoutes([]);
      setForceNewChoice(false);
      return;
    }

    // Si on force un nouveau choix, ne pas créer de routes
    if (forceNewChoice) {
      console.log(
        "🔄 [ROUTES] Forçage d'un nouveau choix - suppression des routes existantes"
      );
      setMobileAirRoutes([]);
      return;
    }

    const routes: MobileAirRoute[] = [];

    devices.forEach((device) => {
      if (device.source === "mobileair" && (device as any).mobileAirRoute) {
        routes.push((device as any).mobileAirRoute);
      }
    });

    setMobileAirRoutes(routes);

    // Définir automatiquement la route la plus récente comme active
    // UNIQUEMENT lors du chargement initial ou si le capteur a changé
    // Ne PAS écraser la sélection manuelle de l'utilisateur pour une autre session
    if (routes.length > 0) {
      const mostRecentRoute = routes.reduce((latest, current) => {
        return new Date(current.startTime) > new Date(latest.startTime)
          ? current
          : latest;
      });

      // Vérifier si on doit définir automatiquement la route active :
      // 1. Aucune route n'est active (chargement initial)
      // 2. Le capteur a changé (la route active actuelle n'existe plus dans les routes ou a un sensorId différent)
      // Mais PAS si l'utilisateur a sélectionné manuellement une autre session du même capteur
      const shouldSetActive =
        !activeMobileAirRoute ||
        activeMobileAirRoute.sensorId !== mostRecentRoute.sensorId ||
        !routes.some(
          (r) =>
            r.sensorId === activeMobileAirRoute.sensorId &&
            r.sessionId === activeMobileAirRoute.sessionId
        );

      if (shouldSetActive) {
        setActiveMobileAirRoute(mostRecentRoute);
        // Réinitialiser aussi la route sélectionnée si elle était liée à l'ancienne route active
        if (
          selectedMobileAirRoute &&
          selectedMobileAirRoute.sensorId !== mostRecentRoute.sensorId
        ) {
          setSelectedMobileAirRoute(null);
        }
      }
    }
  }, [devices, selectedSources, forceNewChoice]);

  // Effet pour ouvrir automatiquement le side panel de sélection MobileAir
  useEffect(() => {
    const isMobileAirSelected = selectedSources.includes(
      "communautaire.mobileair"
    );
    const hasMobileAirRoutes = mobileAirRoutes.length > 0;

    // Si MobileAir est sélectionné mais qu'il n'y a pas encore de routes chargées,
    // ouvrir le side panel de sélection (seulement si l'utilisateur ne l'a pas fermé manuellement)
    if (
      isMobileAirSelected &&
      !hasMobileAirRoutes &&
      !isMobileAirSelectionPanelOpen &&
      !userClosedSelectionPanel
    ) {
      setIsMobileAirSelectionPanelOpen(true);
    }

    // Si MobileAir est sélectionné ET qu'il y a des routes, s'assurer que le panel de sélection est fermé
    // MAIS seulement si l'utilisateur n'a pas fermé manuellement le panel de sélection
    if (
      isMobileAirSelected &&
      hasMobileAirRoutes &&
      isMobileAirSelectionPanelOpen &&
      !userClosedSelectionPanel
    ) {
      setIsMobileAirSelectionPanelOpen(false);
    }
  }, [
    selectedSources,
    mobileAirRoutes.length,
    isMobileAirSelectionPanelOpen,
    userClosedSelectionPanel,
  ]);

  // Effet pour fermer automatiquement le side panel de sélection quand les routes sont chargées
  useEffect(() => {
    const isMobileAirSelected = selectedSources.includes(
      "communautaire.mobileair"
    );

    if (
      isMobileAirSelected &&
      mobileAirRoutes.length > 0 &&
      isMobileAirSelectionPanelOpen &&
      !userClosedSelectionPanel
    ) {
      const timer = setTimeout(() => {
        setIsMobileAirSelectionPanelOpen(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [
    selectedSources,
    mobileAirRoutes.length,
    isMobileAirSelectionPanelOpen,
    userClosedSelectionPanel,
  ]);

  // Effet pour ouvrir automatiquement le side panel de détail quand les routes sont chargées
  useEffect(() => {
    const isMobileAirSelected = selectedSources.includes(
      "communautaire.mobileair"
    );

    if (
      isMobileAirSelected &&
      mobileAirRoutes.length > 0 &&
      activeMobileAirRoute &&
      !isMobileAirDetailPanelOpen &&
      !userClosedDetailPanel
    ) {
      console.log(
        "✅ [AUTO-OPEN] Ouverture automatique du panel de détail MobileAir"
      );
      const timer = setTimeout(() => {
        setIsMobileAirDetailPanelOpen(true);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [
    selectedSources,
    mobileAirRoutes.length,
    activeMobileAirRoute,
    isMobileAirDetailPanelOpen,
    userClosedDetailPanel,
  ]);

  // Effet pour centrer la carte sur la route active
  useEffect(() => {
    if (
      activeMobileAirRoute &&
      activeMobileAirRoute.points.length > 0 &&
      mapRef.current
    ) {
      const bounds = activeMobileAirRoute.points.map(
        (point) => [point.lat, point.lon] as [number, number]
      );
      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [activeMobileAirRoute, mapRef]);

  // Effet pour réinitialiser les états de fermeture manuelle quand les sources changent
  useEffect(() => {
    const isMobileAirSelected = selectedSources.includes(
      "communautaire.mobileair"
    );

    if (!isMobileAirSelected) {
      // Nettoyer IMMÉDIATEMENT les routes pour éviter les conflits
      setActiveMobileAirRoute(null);
      setSelectedMobileAirRoute(null);
      setHoveredMobileAirPoint(null);
      setHighlightedMobileAirPoint(null);
      setMobileAirRoutes([]);
      setUserClosedSelectionPanel(false);
      setUserClosedDetailPanel(false);
      setIsMobileAirSelectionPanelOpen(false);
      setIsMobileAirDetailPanelOpen(false);
    } else {
      // Réinitialiser les états pour permettre à l'utilisateur de choisir à nouveau
      setActiveMobileAirRoute(null);
      setSelectedMobileAirRoute(null);
      setHoveredMobileAirPoint(null);
      setHighlightedMobileAirPoint(null);
      setUserClosedSelectionPanel(false);
      setUserClosedDetailPanel(false);
      setIsMobileAirDetailPanelOpen(false);
      setMobileAirRoutes([]);
      setForceNewChoice(true);
    }
  }, [selectedSources]);

  // Handlers
  const handleMobileAirSensorsSelected = (
    sensorId: string,
    period: { startDate: string; endDate: string }
  ) => {
    console.log(
      "📱 [MOBILEAIR] Capteur sélectionné:",
      sensorId,
      "Période:",
      period
    );

    // Nettoyer les routes existantes pour permettre le rechargement avec remplacement
    try {
      const mobileAirService = DataServiceFactory.getService(
        "mobileair"
      ) as MobileAirService;
      mobileAirService.clearRoutes();
      console.log(
        "🧹 [MOBILEAIR] Routes existantes nettoyées pour permettre le rechargement"
      );
    } catch (error) {
      console.error("Erreur lors du nettoyage des routes MobileAir:", error);
    }

    // Nettoyer les routes et la route active dans le composant
    setMobileAirRoutes([]);
    setActiveMobileAirRoute(null);
    setSelectedMobileAirRoute(null);

    // Désactiver le flag de forçage de nouveau choix quand l'utilisateur fait un choix
    setForceNewChoice(false);

    if (onMobileAirSensorSelected) {
      onMobileAirSensorSelected(sensorId, period);
    }
  };

  const handleCloseMobileAirSelectionPanel = () => {
    setUserClosedSelectionPanel(true);
    setIsMobileAirSelectionPanelOpen(false);
    setMobileAirSelectionPanelSize("normal");
  };

  const handleMobileAirSelectionPanelSizeChange = (
    newSize: "normal" | "fullscreen" | "hidden"
  ) => {
    setMobileAirSelectionPanelSize(newSize);

    if (newSize === "hidden") {
      setUserClosedSelectionPanel(true);
    }
  };

  const handleCloseMobileAirDetailPanel = () => {
    setUserClosedDetailPanel(true);
    setIsMobileAirDetailPanelOpen(false);
    setMobileAirDetailPanelSize("normal");
    setSelectedMobileAirRoute(null);
  };

  const handleMobileAirDetailPanelSizeChange = (
    newSize: "normal" | "fullscreen" | "hidden"
  ) => {
    setMobileAirDetailPanelSize(newSize);

    if (newSize === "hidden") {
      setUserClosedDetailPanel(true);
    }
  };

  const openMobileAirDetailPanelForRoute = (
    route: MobileAirRoute,
    options?: { highlightedPoint?: MobileAirDataPoint | null }
  ) => {
    setActiveMobileAirRoute(route);
    setSelectedMobileAirRoute(route);
    setHighlightedMobileAirPoint(options?.highlightedPoint ?? null);
    setUserClosedDetailPanel(false);
    setMobileAirDetailPanelSize("normal");
    setIsMobileAirDetailPanelOpen(true);
  };

  const handleMobileAirPointClick = (
    route: MobileAirRoute,
    point: MobileAirDataPoint
  ) => {
    openMobileAirDetailPanelForRoute(route, { highlightedPoint: point });
  };

  const handleMobileAirPointHover = useCallback(
    (point: MobileAirDataPoint | null) => {
      setHoveredMobileAirPoint(point);
    },
    []
  );

  const handleMobileAirPointHighlight = useCallback(
    (point: MobileAirDataPoint | null) => {
      setHighlightedMobileAirPoint(point);

      // Centrer la carte sur le point mis en surbrillance sans changer le zoom
      if (point && mapRef.current) {
        mapRef.current.panTo([point.lat, point.lon], {
          animate: true,
          duration: 0.5,
        });
      }
    },
    [mapRef]
  );

  const handleMobileAirRouteClick = (route: MobileAirRoute) => {
    openMobileAirDetailPanelForRoute(route);

    // Centrer la carte sur la route sélectionnée
    if (route.points.length > 0 && mapRef.current) {
      const bounds = route.points.map(
        (point) => [point.lat, point.lon] as [number, number]
      );
      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
    }
  };

  const handleOpenMobileAirSelectionPanel = () => {
    setIsMobileAirSelectionPanelOpen(true);
    setMobileAirSelectionPanelSize("normal");
    setUserClosedSelectionPanel(true);
    setForceNewChoice(false);
  };

  const handleOpenMobileAirDetailPanel = () => {
    setUserClosedDetailPanel(false);
    setIsMobileAirDetailPanelOpen(true);
    setMobileAirDetailPanelSize("normal");
  };

  return {
    // États
    mobileAirRoutes,
    isMobileAirSelectionPanelOpen,
    mobileAirSelectionPanelSize,
    isMobileAirDetailPanelOpen,
    mobileAirDetailPanelSize,
    selectedMobileAirRoute,
    hoveredMobileAirPoint,
    highlightedMobileAirPoint,
    activeMobileAirRoute,

    // Handlers
    handleMobileAirSensorsSelected,
    handleCloseMobileAirSelectionPanel,
    handleMobileAirSelectionPanelSizeChange,
    handleCloseMobileAirDetailPanel,
    handleMobileAirDetailPanelSizeChange,
    openMobileAirDetailPanelForRoute,
    handleMobileAirPointClick,
    handleMobileAirPointHover,
    handleMobileAirPointHighlight,
    handleMobileAirRouteClick,
    handleOpenMobileAirSelectionPanel,
    handleOpenMobileAirDetailPanel,
  };
};

