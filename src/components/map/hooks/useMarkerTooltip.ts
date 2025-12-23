import React, { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import { MeasurementDevice } from '../../../types';
import { useIsMobile } from '../../../hooks/useIsMobile';

interface TooltipState {
  device: MeasurementDevice | null;
  position: { x: number; y: number };
}

interface UseMarkerTooltipOptions {
  minZoom?: number;
  mapRef?: React.RefObject<L.Map | null>;
}

/**
 * Hook pour gérer l'affichage du tooltip au hover sur les marqueurs
 * Désactive automatiquement le tooltip sur les appareils mobiles
 * N'affiche le tooltip qu'à partir du niveau de zoom 11 (par défaut)
 */
export const useMarkerTooltip = (options: UseMarkerTooltipOptions = {}) => {
  const { minZoom = 11, mapRef } = options;
  const [tooltip, setTooltip] = useState<TooltipState>({
    device: null,
    position: { x: 0, y: 0 },
  });
  const [currentZoom, setCurrentZoom] = useState<number>(0);
  const isMobile = useIsMobile();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<TooltipState>(tooltip);

  // Mettre à jour la ref du tooltip à chaque changement
  useEffect(() => {
    tooltipRef.current = tooltip;
  }, [tooltip]);

  // Écouter les changements de zoom et masquer le tooltip si nécessaire
  useEffect(() => {
    const map = mapRef?.current;
    if (!map) {
      // Si pas de mapRef, initialiser à 0
      setCurrentZoom(0);
      return;
    }

    const handleZoom = () => {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
      
      // Masquer le tooltip si le zoom devient inférieur au minimum
      // Utiliser tooltipRef pour avoir la valeur actuelle
      if (zoom < minZoom && tooltipRef.current.device) {
        setTooltip({
          device: null,
          position: { x: 0, y: 0 },
        });
      }
    };

    const handleZoomEnd = () => {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
      
      // Masquer le tooltip si le zoom devient inférieur au minimum
      // Utiliser tooltipRef pour avoir la valeur actuelle
      if (zoom < minZoom && tooltipRef.current.device) {
        setTooltip({
          device: null,
          position: { x: 0, y: 0 },
        });
      }
    };

    // Écouter les événements de zoom
    map.on('zoom', handleZoom);
    map.on('zoomend', handleZoomEnd);

    // Initialiser le zoom actuel
    const initialZoom = map.getZoom();
    if (initialZoom !== undefined) {
      setCurrentZoom(initialZoom);
    }

    return () => {
      map.off('zoom', handleZoom);
      map.off('zoomend', handleZoomEnd);
    };
  }, [mapRef, minZoom]);

  // Fonction pour afficher le tooltip
  const showTooltip = useCallback(
    (device: MeasurementDevice, event: L.LeafletMouseEvent) => {
      // Ne pas afficher sur mobile
      if (isMobile) {
        return;
      }

      // Ne pas afficher si le zoom est inférieur au minimum
      const map = mapRef?.current;
      const zoom = map?.getZoom() || 0;
      if (zoom < minZoom) {
        return;
      }

      // Annuler le timeout précédent s'il existe
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Obtenir la position du curseur dans la fenêtre
      // Utiliser l'événement natif pour obtenir les coordonnées absolues
      const originalEvent = event.originalEvent as MouseEvent;
      const x = originalEvent.clientX;
      const y = originalEvent.clientY;

      setTooltip({
        device,
        position: { x, y },
      });
    },
    [isMobile, mapRef, minZoom]
  );

  // Fonction pour masquer le tooltip
  const hideTooltip = useCallback((immediate = false) => {
    // Annuler le timeout précédent s'il existe
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (immediate) {
      // Masquer immédiatement (lors d'un clic)
      setTooltip({
        device: null,
        position: { x: 0, y: 0 },
      });
    } else {
      // Ajouter un petit délai pour éviter les clignotements lors du hover
      timeoutRef.current = setTimeout(() => {
        setTooltip({
          device: null,
          position: { x: 0, y: 0 },
        });
      }, 100);
    }
  }, []);

  // Nettoyer le timeout au démontage
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Masquer le tooltip si on passe en mode mobile
  useEffect(() => {
    if (isMobile) {
      setTooltip({
        device: null,
        position: { x: 0, y: 0 },
      });
    }
  }, [isMobile]);

  return {
    tooltip,
    showTooltip,
    hideTooltip,
    isMobile,
  };
};

