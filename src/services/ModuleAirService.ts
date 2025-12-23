import { BaseDataService } from "./BaseDataService";
import { MeasurementDevice } from "../types";
import { pollutants } from "../constants/pollutants";
import { getAirQualityLevel } from "../utils";
import sensorsConfig from "../config/moduleAirSensors.json";

interface ModuleAirSensorConfig {
  sensorId: string;
  token: string;
  campagne: string;
}

export class ModuleAirService extends BaseDataService {
  private readonly baseUrl = this.getApiBaseUrl();
  private readonly sensors: ModuleAirSensorConfig[] = sensorsConfig;

  private getApiBaseUrl(): string {
    // En développement, utiliser le proxy Vite
    if (import.meta.env.DEV) {
      return "/aircarto/capteurs";
    }
    // En production, utiliser l'URL complète de l'API
    return "https://api.aircarto.fr/capteurs";
  }

  constructor() {
    super("moduleair");
  }

  async fetchData(params: {
    pollutant: string;
    timeStep: string;
    sources: string[];
  }): Promise<MeasurementDevice[]> {
    try {
      // Check if moduleair is in the selected sources
      const isModuleAirSelected =
        params.sources.includes("moduleair") ||
        params.sources.includes("communautaire.moduleair");
      if (!isModuleAirSelected) {
        return [];
      }

      const devices: MeasurementDevice[] = [];

      for (const config of this.sensors) {
        try {
          const url = `${this.baseUrl}/metadata?capteurType=ModuleAir&capteurID=${config.sensorId}&token=${config.token}&campagne=${config.campagne}&format=JSON`;
          const response = await this.makeRequest(url);

          if (Array.isArray(response) && response.length > 0) {
            const data = response[0];
            const device = this.mapToMeasurementDevice(data, params.pollutant, config);
            if (device) {
              devices.push(device);
            }
          }
        } catch (error) {
          console.error(`Error fetching data for ModuleAir sensor ${config.sensorId}:`, error);
        }
      }

      return devices;
    } catch (error) {
      console.error("Error in ModuleAirService.fetchData:", error);
      throw error;
    }
  }

  async fetchSiteVariables(sensorId: string): Promise<Record<string, { label: string; code_iso: string; en_service: boolean }>> {
    const variables: Record<string, { label: string; code_iso: string; en_service: boolean }> = {};
    const supportedPollutants = ["PM1", "PM25", "PM10", "CO2", "COV", "TEMP", "HUM"];

    supportedPollutants.forEach((pollutant) => {
      const pollutantConfig = pollutants[pollutant.toLowerCase()];
      if (pollutantConfig) {
        variables[pollutant.toLowerCase()] = {
          label: pollutantConfig.name,
          code_iso: pollutant,
          en_service: true
        };
      }
    });

    return variables;
  }

  async fetchSiteInfo(sensorId: string): Promise<{
    variables: Record<string, { label: string; code_iso: string; en_service: boolean }>;
    lastSeenSec?: number;
    address?: string;
    departmentId?: string;
  }> {
    const variables = await this.fetchSiteVariables(sensorId);

    // Find the sensor config to get the token and campagne
    const config = this.sensors.find(s => s.sensorId === sensorId);
    if (config) {
      try {
        const url = `${this.baseUrl}/metadata?capteurType=ModuleAir&capteurID=${config.sensorId}&token=${config.token}&campagne=${config.campagne}&format=JSON`;
        const response = await this.makeRequest(url);
        if (Array.isArray(response) && response.length > 0) {
          return {
            variables,
            lastSeenSec: response[0].last_seen_sec,
            address: response[0].nom_site || response[0].localisation || response[0].adresse,
            departmentId: response[0].departement_id || response[0].cp?.substring(0, 2)
          };
        }
      } catch (error) {
        console.error("Error fetching site info for ModuleAir:", error);
      }
    }

    return { variables };
  }

  async fetchHistoricalData(params: {
    sensorId: string;
    pollutant: string;
    timeStep: string;
    startDate: string;
    endDate: string;
  }): Promise<Array<{ timestamp: string; value: number; unit: string }>> {
    const config = this.sensors.find(s => s.sensorId === params.sensorId);
    if (!config) return [];

    // Map pollutant code to API code
    const apiPollutant = params.pollutant.toUpperCase();

    // Build time range similar to NebuleAir
    const now = new Date();
    const startDate = new Date(params.startDate);
    const timeDiffMs = now.getTime() - startDate.getTime();
    const timeDiffHours = Math.ceil(timeDiffMs / (1000 * 60 * 60));

    let start: string;
    if (timeDiffHours <= 24) {
      start = `-${timeDiffHours}h`;
    } else {
      const timeDiffDays = Math.ceil(timeDiffMs / (1000 * 60 * 60 * 24));
      start = `-${timeDiffDays}d`;
    }
    const stop = "now";
    const freq = this.convertTimeStepToFreq(params.timeStep);

    // Using dataNebuleAir as it's the standard for AirCarto sensors with this structure
    // Adding capteurType=ModuleAir as it might be required for filtering in the backend
    const url = `${this.baseUrl}/dataNebuleAir?capteurID=${config.sensorId}&start=${start}&stop=${stop}&freq=${freq}&capteurType=ModuleAir&token=${config.token}&campagne=${config.campagne}`;

    try {
      const response = await this.makeRequest(url);
      if (!Array.isArray(response)) return [];

      console.log(`[ModuleAirService] Historical response for ${params.pollutant}:`, response?.length > 0 ? response[0] : "Empty");

      const mappedData = response.map((point: any) => {
        // Try multiple possible keys for the pollutant value
        const val = point[apiPollutant] ??
          point[params.pollutant] ??
          point[params.pollutant.toLowerCase()] ??
          point[params.pollutant.toUpperCase()] ??
          point[params.pollutant.replace("pm", "PM")] ??
          point[params.pollutant.replace("pm", "PM").replace("25", "2.5")] ??
          point[params.pollutant.replace("pm", "PM").replace("1", "1.0")] ??
          point[params.pollutant.replace("temp", "TEMP")] ??
          point[params.pollutant.replace("hum", "HUM")];

        return {
          timestamp: point.time || point.timestamp || point.date_debut,
          value: (val !== undefined && val !== null && val !== "-1") ? parseFloat(val) : 0,
          unit: pollutants[params.pollutant]?.unit || ""
        };
      }).filter(p => !isNaN(p.value));

      console.log(`[ModuleAirService] Mapped data for ${params.pollutant}:`, mappedData.length > 0 ? mappedData[0] : "Empty");
      return mappedData;
    } catch (error) {
      console.error("Error fetching historical data for ModuleAir:", error);
      return [];
    }
  }

  private formatDateForHistorical(dateStr: string, isEnd: boolean = false): string {
    const date = new Date(dateStr);
    if (isEnd) {
      date.setUTCHours(23, 59, 59, 999);
    } else {
      date.setUTCHours(0, 0, 0, 0);
    }
    return date.toISOString();
  }

  private convertTimeStepToFreq(timeStep: string): string {
    const mapping: Record<string, string> = {
      instantane: "2m",
      deuxMin: "2m",
      quartHeure: "15m",
      heure: "1h",
      jour: "1d"
    };
    return mapping[timeStep] || "2m";
  }

  private mapToMeasurementDevice(data: any, selectedPollutant: string, config: ModuleAirSensorConfig): MeasurementDevice | null {
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);

    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
      return null;
    }

    const valueStr = data[selectedPollutant.toUpperCase()];
    const value = (valueStr !== undefined && valueStr !== null && valueStr !== "-1") ? parseFloat(valueStr) : null;

    const pollutantConfig = pollutants[selectedPollutant];
    const qualityLevel = (value !== null && pollutantConfig?.thresholds)
      ? getAirQualityLevel(value, pollutantConfig.thresholds)
      : "default";

    return {
      id: data.sensorId,
      name: data.nom_site || `ModuleAir ${data.sensorId}`,
      latitude: lat,
      longitude: lon,
      source: this.sourceCode,
      pollutant: selectedPollutant,
      value: value ?? 0,
      unit: pollutantConfig?.unit || "",
      timestamp: data.time,
      status: value === null ? "inactive" : (data.connected ? "active" : "inactive"),
      qualityLevel,
      address: data.nom_site || data.localisation || data.adresse,
      departmentId: data.departement_id || data.cp?.substring(0, 2)
    };
  }
}
