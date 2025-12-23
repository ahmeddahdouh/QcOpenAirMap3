import { DataService } from "../types";
import { AtmoRefService } from "./AtmoRefService";
import { AtmoMicroService } from "./AtmoMicroService";
import { NebuleAirService } from "./NebuleAirService";
import { SignalAirService } from "./SignalAirService";
import { MobileAirService } from "./MobileAirService";
import { PurpleAirService } from "./PurpleAirService";
import { SensorCommunityService } from "./SensorCommunityService";
import { ModuleAirService } from "./ModuleAirService";

export class DataServiceFactory {
  private static services: Map<string, DataService> = new Map();

  static getService(sourceCode: string): DataService {
    if (!this.services.has(sourceCode)) {
      let service: DataService;

      switch (sourceCode) {
        case "atmoRef":
          service = new AtmoRefService();
          break;
        case "atmoMicro":
          service = new AtmoMicroService();
          break;
        case "nebuleair":
          service = new NebuleAirService();
          break;
        case "signalair":
          service = new SignalAirService();
          break;
        case "mobileair":
          service = new MobileAirService();
          break;
        case "purpleair":
          service = new PurpleAirService();
          break;
        case "sensorCommunity":
          service = new SensorCommunityService();
          break;
        case "moduleair":
          service = new ModuleAirService();
          break;
        default:
          throw new Error(`Service non supporté pour la source: ${sourceCode}`);
      }

      this.services.set(sourceCode, service);
    }

    return this.services.get(sourceCode)!;
  }

  static getServices(sourceCodes: string[]): DataService[] {
    return sourceCodes.map((code) => this.getService(code));
  }
}
