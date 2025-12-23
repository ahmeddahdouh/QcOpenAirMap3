// src/services/StadiaService.ts

export class StadiaService {
  static getApiKey(): string | undefined {
    return process.env.STADIA_AUTH;
  }

  static getAuthHeader(): { [key: string]: string } {
    const apiKey = StadiaService.getApiKey();
    return apiKey ? { 'Authorization': `Stadia-Auth ${apiKey}` } : {};
  }
}
