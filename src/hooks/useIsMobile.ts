import { useState, useEffect } from 'react';

/**
 * Hook pour détecter si l'utilisateur est sur un appareil mobile/tactile
 * Détecte les écrans tactiles et les petits écrans
 * 
 * @returns {boolean} true si l'appareil est mobile/tactile
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Fonction pour détecter si c'est un appareil mobile/tactile
    const checkIsMobile = (): boolean => {
      // Vérifier si l'appareil a un écran tactile
      const hasTouchScreen = 
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        // @ts-ignore - Propriété non standard mais largement supportée
        (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0);

      // Vérifier la largeur d'écran (mobile généralement < 768px)
      const isSmallScreen = window.innerWidth < 768;

      // Combiner les deux conditions : écran tactile ET petit écran
      return hasTouchScreen && isSmallScreen;
    };

    // Vérifier au montage
    setIsMobile(checkIsMobile());

    // Écouter les changements de taille d'écran
    const handleResize = () => {
      setIsMobile(checkIsMobile());
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return isMobile;
};

