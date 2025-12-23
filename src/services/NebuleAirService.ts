/// <reference types="vite/client" />
import { BaseDataService } from "./BaseDataService";
import {
  MeasurementDevice,
  NebuleAirSensor,
  NebuleAirMetadataResponse,
  NEBULEAIR_POLLUTANT_MAPPING,
  NEBULEAIR_TIMESTEP_MAPPING,
  TemporalDataPoint,
} from "../types";
import { getAirQualityLevel } from "../utils";
import { pollutants } from "../constants/pollutants";

export class NebuleAirService extends BaseDataService {
  private readonly BASE_URL = this.getApiBaseUrl();
  private sensorsMetadataCache: NebuleAirSensor[] | null = null;
  private lastMetadataFetch: number = 0;
  private readonly METADATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super("nebuleair");
  }

  private getApiBaseUrl(): string {
    // En développement, utiliser le proxy Vite
    if (import.meta.env.DEV) {
      return "/aircarto";
    }
    // En production, utiliser l'URL complète de l'API
    return "https://api.aircarto.fr";
  }

  async fetchData(params: {
    pollutant: string;
    timeStep: string;
    sources: string[];
    signalAirPeriod?: { startDate: string; endDate: string };
    mobileAirPeriod?: { startDate: string; endDate: string };
    selectedSensors?: string[];
    signalAirSelectedTypes?: string[];
  }): Promise<MeasurementDevice[]> {
    try {
      // Vérifier si le polluant est supporté par NebuleAir
      const nebuleAirPollutant = this.getNebuleAirPollutantName(
        params.pollutant
      );
      if (!nebuleAirPollutant) {
        console.warn(`Polluant ${params.pollutant} non supporté par NebuleAir`);
        return [];
      }

      // Vérifier si le pas de temps est supporté par NebuleAir
      const timeStepSuffix = this.getNebuleAirTimeStepSuffix(params.timeStep);
      if (timeStepSuffix === null) {
        console.warn(
          `Pas de temps ${params.timeStep} non supporté par NebuleAir`
        );
        return [];
      }

      const pollutantConfig = pollutants[params.pollutant];

      // Récupérer les données des capteurs
      const sensorsData = await this.fetchSensorsData();

      // Transformer les données en MeasurementDevice
      const devices: MeasurementDevice[] = [];

      for (const sensor of sensorsData) {
        // Vérifier si le capteur doit être affiché sur la carte
        if (!sensor.displayMap) {
          continue;
        }

        // Vérifier si le capteur a des coordonnées valides
        const lat = parseFloat(sensor.latitude);
        const lon = parseFloat(sensor.longitude);
        if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
          continue;
        }

        // Récupérer la valeur selon le polluant et le pas de temps
        const value = this.extractSensorValue(
          sensor,
          nebuleAirPollutant,
          timeStepSuffix
        );

        // Vérifier si la donnée est récente selon le pas de temps
        const isDataRecent = this.isDataRecent(sensor.time, params.timeStep);

        if (value === null || value === -1 || !isDataRecent) {
          // Capteur sans donnée valide ou donnée trop ancienne - utiliser le marqueur par défaut
          devices.push({
            id: sensor.sensorId,
            name: `NebuleAir ${sensor.sensorId}`,
            latitude: lat,
            longitude: lon,
            source: this.sourceCode,
            pollutant: params.pollutant,
            value: 0,
            unit: pollutantConfig?.unit || "µg/m³",
            timestamp: sensor.time,
            status: "inactive",
            qualityLevel: "default",
          } as MeasurementDevice & { qualityLevel: string });
        } else {
          // Capteur avec donnée valide et récente - considérer comme actif
          const pollutant = pollutants[params.pollutant];
          // Utiliser la valeur arrondie pour la cohérence avec l'affichage
          const roundedValue = Math.round(value);
          const qualityLevel =
            pollutant && pollutant.thresholds
              ? getAirQualityLevel(roundedValue, pollutant.thresholds)
              : "default";

          devices.push({
            id: sensor.sensorId,
            name: `NebuleAir ${sensor.sensorId}`,
            latitude: lat,
            longitude: lon,
            source: this.sourceCode,
            pollutant: params.pollutant,
            value: value, // Garder la valeur exacte pour les calculs
            unit: pollutantConfig?.unit || pollutant?.unit || "µg/m³",
            timestamp: sensor.time,
            status: "active", // Toujours actif si on a une valeur valide et récente
            qualityLevel,
          } as MeasurementDevice & { qualityLevel: string });
        }
      }

      return devices;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des données NebuleAir:",
        error
      );
      throw error;
    }
  }

  private async fetchSensorsData(): Promise<NebuleAirSensor[]> {
    try {
      const url = `${this.BASE_URL}/capteurs/metadata`;
      console.log("🌐 [NebuleAir] Requête API:", url);
      const response = await this.makeRequest(url);

      let sensors: NebuleAirSensor[] = [];
      if (Array.isArray(response)) {
        sensors = response;
        console.log(`✅ [NebuleAir] ${sensors.length} capteurs récupérés (Format: Array)`);
      } else if (response && response.sensors && Array.isArray(response.sensors)) {
        sensors = response.sensors;
        console.log(`✅ [NebuleAir] ${sensors.length} capteurs récupérés (Format: Object.sensors)`);
      } else {
        console.error("❌ [NebuleAir] Format de réponse API inconnu:", response);
        throw new Error("Format de réponse NebuleAir invalide");
      }

      return sensors;
    } catch (error) {
      console.error("❌ [NebuleAir] Échec de récupération des données API:", error);
      throw error;
    }
  }


  private getNebuleAirPollutantName(pollutant: string): string | null {
    // Mapping inverse : nos codes vers les codes NebuleAir
    const reverseMapping: Record<string, string> = {};
    Object.entries(NEBULEAIR_POLLUTANT_MAPPING).forEach(
      ([nebuleAir, ourCode]) => {
        reverseMapping[ourCode] = nebuleAir;
      }
    );

    return reverseMapping[pollutant] || null;
  }

  private getNebuleAirTimeStepSuffix(timeStep: string): string | null {
    return NEBULEAIR_TIMESTEP_MAPPING[timeStep] !== undefined
      ? NEBULEAIR_TIMESTEP_MAPPING[timeStep]
      : null;
  }

  private extractSensorValue(
    sensor: NebuleAirSensor,
    pollutant: string,
    timeStepSuffix: string
  ): number | null {
    // Construire le nom de la propriété selon le polluant et le pas de temps
    const propertyName = `${pollutant}${timeStepSuffix}`;

    // Récupérer la valeur depuis l'objet sensor
    let value = (sensor as any)[propertyName];

    // Pour le bruit (NOISE) et le CO2, seules les valeurs instantanées sont disponibles pour le moment
    if (
      (value === null || value === undefined || value === "-1") &&
      (pollutant === "NOISE" || pollutant === "CO2") &&
      timeStepSuffix !== ""
    ) {
      value = (sensor as any)[pollutant];
    }

    if (value === null || value === undefined || value === "-1") {
      return null;
    }

    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? null : numericValue;
  }

  private isDataRecent(timestamp: string, timeStep: string): boolean {
    try {
      const dataTime = new Date(timestamp);
      const now = new Date();
      const timeDiffMs = now.getTime() - dataTime.getTime();
      const timeDiffMinutes = timeDiffMs / (1000 * 60);

      // Définir les seuils de fraîcheur selon le pas de temps
      const freshnessThresholds: Record<string, number> = {
        instantane: 3 * 60, // 3 minutes pour les données instantanées
        deuxMin: 3, // 3 minutes pour les données 2min
        quartHeure: 16, // 16 minutes pour les données 15min
        heure: 61, // 61 minutes pour les données horaires
        jour: 24 * 60, // 24 heures pour les données journalières
      };

      const threshold = freshnessThresholds[timeStep];
      if (threshold === undefined) {
        console.warn(
          `Pas de temps non reconnu pour la vérification de fraîcheur: ${timeStep}`
        );
        return true; // Par défaut, considérer comme récent
      }

      return timeDiffMinutes <= threshold;
    } catch (error) {
      console.warn(
        `Erreur lors de la vérification de fraîcheur pour ${timestamp}:`,
        error
      );
      return false; // En cas d'erreur, considérer comme non récent
    }
  }

  // Méthode pour récupérer les variables disponibles d'un capteur
  async fetchSiteVariables(
    sensorId: string
  ): Promise<
    Record<string, { label: string; code_iso: string; en_service: boolean }>
  > {
    try {
      console.log("🔍 [NebuleAir] fetchSiteVariables appelé pour:", sensorId);

      // Pour NebuleAir, tous les capteurs supportent les mêmes polluants
      // Pas besoin de faire un appel API pour récupérer les métadonnées
      const variables: Record<
        string,
        { label: string; code_iso: string; en_service: boolean }
      > = {};

      // Polluants supportés par NebuleAir - tous actifs par défaut
      const supportedPollutants = ["PM1", "PM25", "PM10", "NOISE", "CO2"];

      supportedPollutants.forEach((nebuleAirPollutant) => {
        // Convertir le code NebuleAir vers notre code interne
        const ourPollutantCode =
          NEBULEAIR_POLLUTANT_MAPPING[nebuleAirPollutant];
        if (ourPollutantCode) {
          variables[ourPollutantCode] = {
            label: this.getPollutantLabel(nebuleAirPollutant),
            code_iso: this.getPollutantCodeISO(nebuleAirPollutant),
            en_service: true, // Tous les polluants NebuleAir sont actifs
          };
        }
      });

      console.log("✅ [NebuleAir] Variables retournées:", variables);
      return variables;
    } catch (error) {
      console.error(
        `❌ [NebuleAir] Erreur lors de la récupération des variables pour ${sensorId}:`,
        error
      );
      return {};
    }
  }

  // Méthode pour récupérer les métadonnées complètes d'un capteur (variables + last_seen_sec)
  async fetchSiteInfo(
    sensorId: string
  ): Promise<{
    variables: Record<string, { label: string; code_iso: string; en_service: boolean }>;
    lastSeenSec?: number;
  }> {
    try {
      console.log("🔍 [NebuleAir] fetchSiteInfo appelé pour:", sensorId);

      // Récupérer les variables
      const variables = await this.fetchSiteVariables(sensorId);

      // Récupérer les métadonnées du capteur pour obtenir last_seen_sec
      const sensorsMetadata = await this.getCachedSensorsMetadata();
      const sensor = sensorsMetadata.find((s) => s.sensorId === sensorId);

      return {
        variables,
        lastSeenSec: sensor?.last_seen_sec,
      };
    } catch (error) {
      console.error(
        `❌ [NebuleAir] Erreur lors de la récupération des infos pour ${sensorId}:`,
        error
      );
      // En cas d'erreur, retourner au moins les variables
      const variables = await this.fetchSiteVariables(sensorId);
      return { variables };
    }
  }

  private getPollutantLabel(pollutant: string): string {
    const labels: Record<string, string> = {
      PM1: "Particules PM₁",
      PM25: "Particules PM₂.₅",
      PM10: "Particules PM₁₀",
      NOISE: "Bruit",
    };
    return labels[pollutant] || pollutant;
  }

  private getPollutantCodeISO(pollutant: string): string {
    const codes: Record<string, string> = {
      PM1: "PM1",
      PM25: "PM2.5",
      PM10: "PM10",
      NOISE: "dB(A)",
    };
    return codes[pollutant] || pollutant;
  }

  // Méthode pour récupérer les données historiques d'un capteur
  async fetchHistoricalData(params: {
    sensorId: string;
    pollutant: string;
    timeStep: string;
    startDate: string;
    endDate: string;
  }): Promise<Array<{ timestamp: string; value: number; unit: string }>> {
    try {
      const callId = Math.random().toString(36).substr(2, 9);
      console.log(
        `🔍 [NebuleAir] [${callId}] Début fetchHistoricalData avec params:`,
        {
          ...params,
          callId,
          timestamp: new Date().toISOString(),
          stackTrace: new Error().stack?.split("\n").slice(1, 4).join("\n"),
        }
      );

      // Vérifier si le polluant est supporté
      const nebuleAirPollutant = this.getNebuleAirPollutantName(
        params.pollutant
      );
      if (!nebuleAirPollutant) {
        console.warn(
          `❌ [NebuleAir] Polluant ${params.pollutant} non supporté par NebuleAir`
        );
        return [];
      }
      console.log(
        `✅ [NebuleAir] [${callId}] Polluant supporté:`,
        nebuleAirPollutant
      );

      // Convertir les dates au format attendu par l'API
      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);
      const now = new Date();

      console.log(`🔍 [NebuleAir] [${callId}] Calcul des dates:`, {
        startDate: params.startDate,
        endDate: params.endDate,
        startDateObj: startDate.toISOString(),
        endDateObj: endDate.toISOString(),
        now: now.toISOString(),
      });

      // Calculer la période relative en heures
      const timeDiffMs = now.getTime() - startDate.getTime();
      const timeDiffHours = Math.ceil(timeDiffMs / (1000 * 60 * 60));

      console.log(`🔍 [NebuleAir] [${callId}] Calcul de la période:`, {
        timeDiffMs,
        timeDiffHours,
        timeDiffDays: Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24)),
      });

      // Formater les paramètres start et stop
      let start: string;
      let stop: string;

      if (timeDiffHours <= 24) {
        // Pour les périodes ≤ 24h, utiliser le format en heures
        start = `-${timeDiffHours}h`;
      } else {
        // Pour les périodes > 24h, utiliser le format en jours
        const timeDiffDays = Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24));
        start = `-${timeDiffDays}d`;
      }

      // Pour les boutons prédéfinis, toujours utiliser "now" pour stop
      // (3h, 24h, 7d, 30d) car on veut toujours la période jusqu'au présent
      stop = "now";

      // Convertir le pas de temps au format de l'API
      const freq = this.convertTimeStepToFreq(params.timeStep);

      // Construire l'URL pour les données historiques selon l'exemple fourni
      const url = `${this.BASE_URL}/capteurs/dataNebuleAir?capteurID=${params.sensorId}&start=${start}&stop=${stop}&freq=${freq}`;

      console.log(`🌐 [NebuleAir] [${callId}] URL construite:`, url);
      console.log(`📊 [NebuleAir] [${callId}] Paramètres finaux:`, {
        sensorId: params.sensorId,
        pollutant: params.pollutant,
        timeStep: params.timeStep,
        startDate: params.startDate,
        endDate: params.endDate,
        start,
        stop: "now (toujours jusqu'au présent)",
        freq,
        nebuleAirPollutant,
        timeDiffHours,
      });

      const response = await this.makeRequest(url);
      console.log("📥 [NebuleAir] Réponse reçue:", response);

      // L'API retourne directement un tableau de données
      if (!Array.isArray(response)) {
        console.warn(
          "❌ [NebuleAir] Format de réponse historique NebuleAir non reconnu:",
          response
        );
        return [];
      }

      console.log(
        "📊 [NebuleAir] Nombre de points de données reçus:",
        response.length
      );

      // Transformer les données historiques
      const historicalData = response
        .map((dataPoint: any, index: number) => {
          // Extraire la valeur selon le polluant
          const value = this.extractHistoricalValue(
            dataPoint,
            nebuleAirPollutant
          );

          // Extraire le timestamp (l'API NebuleAir utilise "time")
          const timestamp = dataPoint.timestamp || dataPoint.time || dataPoint.date;

          if (index < 3) {
            // Log des 3 premiers points pour debug
            console.log(`🔍 [NebuleAir] Point ${index}:`, {
              dataPoint,
              value,
              nebuleAirPollutant,
              timestamp,
              timestampType: typeof timestamp,
            });
          }

          if (value === null || value === undefined) {
            return null;
          }

          if (!timestamp) {
            console.warn(`⚠️ [NebuleAir] Point ${index} sans timestamp:`, dataPoint);
            return null;
          }

          return {
            timestamp: timestamp,
            value: value,
            unit: "µg/m³",
          };
        })
        .filter(
          (item): item is { timestamp: string; value: number; unit: string } =>
            item !== null
        );

      // Trier les données par timestamp pour s'assurer qu'elles sont dans l'ordre chronologique
      historicalData.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      console.log(
        "✅ [NebuleAir] Données historiques transformées:",
        historicalData.length,
        "points"
      );

      if (historicalData.length > 0) {
        console.log("📊 [NebuleAir] Premier point:", historicalData[0]);
        console.log("📊 [NebuleAir] Dernier point:", historicalData[historicalData.length - 1]);
      }

      return historicalData;
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des données historiques NebuleAir:",
        error
      );
      throw error;
    }
  }

  // Fonction pour formater les dates selon les besoins du mode historique
  private formatDateForHistoricalMode(
    dateString: string,
    isEndDate: boolean = false
  ): string {
    const date = new Date(dateString);

    if (isEndDate) {
      // Date de fin : toujours à 23:59:59 UTC
      date.setUTCHours(23, 59, 59, 999);
    } else {
      // Date de début : toujours à 00:00:00 UTC
      date.setUTCHours(0, 0, 0, 0);
    }

    return date.toISOString();
  }

  // Méthode pour convertir le pas de temps au format de l'API
  private convertTimeStepToFreq(timeStep: string): string {
    const timeStepMapping: Record<string, string> = {
      instantane: "2m", // Scan -> 2 minutes
      deuxMin: "2m", // ≤2min -> 2 minutes
      quartHeure: "15m", // 15 minutes
      heure: "1h", // 1 heure
      jour: "1d", // 1 jour
    };

    return timeStepMapping[timeStep] || "2m"; // Par défaut 2 minutes
  }

  // Méthode pour extraire la valeur d'un point de données historique
  private extractHistoricalValue(
    dataPoint: any,
    pollutant: string
  ): number | null {
    // L'API retourne les valeurs directement par nom de polluant (PM1, PM25, PM10)
    const value = dataPoint[pollutant];

    console.log(`🔍 [NebuleAir] Extraction valeur pour ${pollutant}:`, {
      dataPoint,
      value,
    });

    if (value === null || value === undefined || value === "-1") {
      return null;
    }

    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? null : numericValue;
  }

  // Méthode pour récupérer les données temporelles pour la visualisation historique
  async fetchTemporalData(params: {
    pollutant: string;
    timeStep: string;
    startDate: string;
    endDate: string;
    selectedSensors?: string[];
    sensorsMetadata?: NebuleAirSensor[]; // Métadonnées des capteurs (optionnel)
  }): Promise<TemporalDataPoint[]> {
    try {
      console.log(
        "🕒 [NebuleAir] Récupération des données temporelles:",
        params
      );

      // Vérifier si le polluant est supporté par NebuleAir
      const nebuleAirPollutant = this.getNebuleAirPollutantName(
        params.pollutant
      );
      if (!nebuleAirPollutant) {
        console.warn(`Polluant ${params.pollutant} non supporté par NebuleAir`);
        return [];
      }

      // Convertir le pas de temps au format de l'API
      const freq = this.convertTimeStepToFreq(params.timeStep);

      // Formater les dates au format ISO pour l'API
      const startDate = this.formatDateForHistoricalMode(
        params.startDate,
        false
      );
      const endDate = this.formatDateForHistoricalMode(params.endDate, true);

      // Construire l'URL pour récupérer toutes les données des capteurs
      const url = `${this.BASE_URL
        }/capteurs/dataNebuleAirAll?start=${encodeURIComponent(
          startDate
        )}&end=${encodeURIComponent(endDate)}&freq=${freq}&format=JSON`;

      console.log(`🌐 [NebuleAir] URL construite:`, url);

      const response = await this.makeRequest(url);
      console.log("📥 [NebuleAir] Réponse reçue:", response);

      // L'API retourne un objet avec les capteurs comme clés
      if (!response || typeof response !== "object") {
        console.warn(
          "❌ [NebuleAir] Format de réponse temporelle non reconnu:",
          response
        );
        return [];
      }

      // Récupérer les métadonnées des capteurs pour avoir les coordonnées
      // Utiliser les métadonnées fournies en paramètre ou le cache
      let sensorsMetadata: NebuleAirSensor[];
      if (params.sensorsMetadata) {
        sensorsMetadata = params.sensorsMetadata;
        console.log(
          "✅ [NebuleAir] Utilisation des métadonnées fournies en paramètre"
        );
      } else {
        sensorsMetadata = await this.getCachedSensorsMetadata();
        console.log("✅ [NebuleAir] Utilisation des métadonnées en cache");
      }

      const sensorsMap = new Map<string, NebuleAirSensor>();
      sensorsMetadata.forEach((sensor) => {
        sensorsMap.set(sensor.sensorId, sensor);
      });

      // Transformer les données en TemporalDataPoint
      const temporalDataPoints: TemporalDataPoint[] = [];
      const timestampMap = new Map<string, MeasurementDevice[]>();

      // Parcourir tous les capteurs dans la réponse
      for (const [sensorId, sensorData] of Object.entries(response)) {
        // Vérifier si ce capteur doit être inclus
        if (
          params.selectedSensors &&
          !params.selectedSensors.includes(sensorId)
        ) {
          continue;
        }

        // Récupérer les métadonnées du capteur
        const sensorMetadata = sensorsMap.get(sensorId);
        if (!sensorMetadata || !sensorMetadata.displayMap) {
          continue;
        }

        // Vérifier les coordonnées
        const lat = parseFloat(sensorMetadata.latitude);
        const lon = parseFloat(sensorMetadata.longitude);
        if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
          continue;
        }

        // Parcourir les données temporelles du capteur
        if (Array.isArray(sensorData)) {
          sensorData.forEach((dataPoint: any) => {
            const timestamp = dataPoint.time || dataPoint.timestamp;
            if (!timestamp) return;

            // Extraire la valeur selon le polluant
            const value = this.extractHistoricalValue(
              dataPoint,
              nebuleAirPollutant
            );
            if (value === null || value === -1) return;

            // Créer le device de mesure
            const device: MeasurementDevice = {
              id: sensorId,
              name: `NebuleAir ${sensorId}`,
              latitude: lat,
              longitude: lon,
              source: this.sourceCode,
              pollutant: params.pollutant,
              value: value,
              unit: "µg/m³",
              timestamp: timestamp,
              status: "active",
              qualityLevel: this.getQualityLevel(value, params.pollutant),
            } as MeasurementDevice & { qualityLevel: string };

            // Grouper par timestamp
            if (!timestampMap.has(timestamp)) {
              timestampMap.set(timestamp, []);
            }
            timestampMap.get(timestamp)!.push(device);
          });
        }
      }

      // Convertir en TemporalDataPoint
      for (const [timestamp, devices] of timestampMap.entries()) {
        if (devices.length === 0) continue;

        // Calculer les métadonnées
        const values = devices.map((d) => d.value);
        const averageValue =
          values.reduce((sum, val) => sum + val, 0) / values.length;

        const qualityLevels: Record<string, number> = {};
        devices.forEach((device) => {
          const qualityLevel = (device as any).qualityLevel || "default";
          qualityLevels[qualityLevel] = (qualityLevels[qualityLevel] || 0) + 1;
        });

        temporalDataPoints.push({
          timestamp,
          devices,
          deviceCount: devices.length,
          averageValue,
          qualityLevels,
        });
      }

      // Trier par timestamp
      temporalDataPoints.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      console.log(`✅ [NebuleAir] Données temporelles récupérées:`, {
        totalPoints: temporalDataPoints.length,
        totalDevices: temporalDataPoints.reduce(
          (sum, point) => sum + point.deviceCount,
          0
        ),
        timeRange: {
          start: temporalDataPoints[0]?.timestamp,
          end: temporalDataPoints[temporalDataPoints.length - 1]?.timestamp,
        },
      });

      return temporalDataPoints;
    } catch (error) {
      console.error(
        "❌ [NebuleAir] Erreur lors de la récupération des données temporelles:",
        error
      );
      throw error;
    }
  }

  // Méthode utilitaire pour calculer le niveau de qualité
  private getQualityLevel(value: number, pollutant: string): string {
    const pollutantConfig = pollutants[pollutant];
    if (!pollutantConfig) return "default";

    const thresholds = pollutantConfig.thresholds;
    if (value <= thresholds.bon.max) return "bon";
    if (value <= thresholds.moyen.max) return "moyen";
    if (value <= thresholds.degrade.max) return "degrade";
    if (value <= thresholds.mauvais.max) return "mauvais";
    if (value <= thresholds.tresMauvais.max) return "tresMauvais";
    return "extrMauvais";
  }

  // Méthode pour récupérer les métadonnées avec cache
  private async getCachedSensorsMetadata(): Promise<NebuleAirSensor[]> {
    const now = Date.now();

    // Vérifier si le cache est valide
    if (
      this.sensorsMetadataCache &&
      now - this.lastMetadataFetch < this.METADATA_CACHE_DURATION
    ) {
      console.log("📦 [NebuleAir] Utilisation du cache des métadonnées");
      return this.sensorsMetadataCache;
    }

    // Récupérer les métadonnées et mettre à jour le cache
    console.log(
      "🔄 [NebuleAir] Récupération des métadonnées (cache expiré ou vide)"
    );
    this.sensorsMetadataCache = await this.fetchSensorsData();
    this.lastMetadataFetch = now;

    return this.sensorsMetadataCache;
  }
}
