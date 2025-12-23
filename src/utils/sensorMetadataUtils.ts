import { MeasurementDevice } from '../types';
import { AtmoRefService } from '../services/AtmoRefService';
import { AtmoMicroService } from '../services/AtmoMicroService';
import { NebuleAirService } from '../services/NebuleAirService';

interface SensorMetadata {
  sensorModel?: string;
  sensorBrand?: string;
  measuredPollutants?: string[];
}

// Cache pour éviter les appels API multiples
const metadataCache = new Map<string, SensorMetadata>();

/**
 * Récupère les métadonnées d'un capteur (modèle, polluants mesurés, etc.)
 * Utilise un cache pour éviter les appels API multiples
 * 
 * @param device - Le device de mesure
 * @returns Métadonnées du capteur
 */
export const getSensorMetadata = async (
  device: MeasurementDevice
): Promise<SensorMetadata> => {
  const cacheKey = `${device.source}-${device.id}`;

  // Vérifier le cache
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey)!;
  }

  const metadata: SensorMetadata = {};

  try {
    // AtmoRef : récupérer les variables disponibles
    if (device.source === 'atmoRef') {
      const atmoRefService = new AtmoRefService();
      const variables = await atmoRefService.fetchStationVariables(device.id);
      metadata.measuredPollutants = Object.keys(variables).map(
        (key) => variables[key].label
      );
    }

    // AtmoMicro : récupérer le modèle et les variables
    else if (device.source === 'atmoMicro') {
      const atmoMicroService = new AtmoMicroService();
      const siteInfo = await atmoMicroService.fetchSiteVariables(device.id);
      metadata.sensorModel = siteInfo.sensorModel;
      metadata.measuredPollutants = Object.keys(siteInfo.variables).map(
        (key) => siteInfo.variables[key].label
      );
    }

    // NebuleAir : récupérer les variables disponibles
    // Les capteurs NebuleAir mesurent toujours PM₁, PM₂.₅ et PM₁₀ au minimum
    else if (device.source === 'nebuleair') {
      const nebuleAirService = new NebuleAirService();
      const variables = await nebuleAirService.fetchSiteVariables(device.id);
      
      // Vérifier que variables n'est pas undefined
      const pollutantsFromAPI = variables
        ? Object.keys(variables).map((key) => variables[key].label)
        : [];
      
      // Les capteurs NebuleAir mesurent toujours ces 3 polluants au minimum
      // On les ajoute explicitement (seront dédupliqués lors de la normalisation dans le tooltip)
      metadata.measuredPollutants = [
        'PM₁',
        'PM₂.₅',
        'PM₁₀',
        ...pollutantsFromAPI, // Ajouter les autres polluants potentiels (ex: Bruit)
      ];
    }

    // Sensor Community : métadonnées dans le device
    else if (device.source === 'sensorCommunity') {
      const sensorCommunityDevice = device as MeasurementDevice & {
        manufacturer?: string;
        sensorType?: string;
      };
      if (sensorCommunityDevice.manufacturer) {
        metadata.sensorBrand = sensorCommunityDevice.manufacturer;
      }
      if (sensorCommunityDevice.sensorType) {
        metadata.sensorModel = sensorCommunityDevice.sensorType;
      }
      // Sensor Community mesure généralement PM2.5 et PM10
      metadata.measuredPollutants = ['PM₂.₅', 'PM₁₀'];
    }

    // PurpleAir : métadonnées dans le device
    else if (device.source === 'purpleair') {
      metadata.sensorModel = 'PurpleAir';
      const purpleDevice = device as MeasurementDevice & {
        pm1Value?: number;
        pm25Value?: number;
        pm10Value?: number;
      };
      metadata.measuredPollutants = [];
      if (purpleDevice.pm1Value !== undefined) {
        metadata.measuredPollutants.push('PM₁');
      }
      if (purpleDevice.pm25Value !== undefined) {
        metadata.measuredPollutants.push('PM₂.₅');
      }
      if (purpleDevice.pm10Value !== undefined) {
        metadata.measuredPollutants.push('PM₁₀');
      }
    }
  } catch (error) {
    console.error(
      `Erreur lors de la récupération des métadonnées pour ${device.source}-${device.id}:`,
      error
    );
  }

  // Mettre en cache (avec expiration après 5 minutes)
  metadataCache.set(cacheKey, metadata);
  setTimeout(() => {
    metadataCache.delete(cacheKey);
  }, 5 * 60 * 1000);

  return metadata;
};

/**
 * Nettoie le cache des métadonnées
 */
export const clearMetadataCache = (): void => {
  metadataCache.clear();
};

