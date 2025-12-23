// Service pour récupérer les épisodes de pollution depuis l'API Atmosud

export interface PollutionEpisode {
  date: string;
  polluant: string;
  polluant_libelle: string;
  zone: string;
  zone_libelle: string;
  niveau: number; // 1 = Information-recommandation, 2 = Alerte
  niveau_code: string; // "IR" pour Information-recommandation, "A" pour Alerte
  niveau_libelle: string; // "Information-recommandation", "Alerte niveau 1", "Alerte niveau 2"
}

export class PollutionEpisodeService {
  private readonly API_URL = "https://api.atmosud.org/episodes/liste";
  private episodesCache: PollutionEpisode[] | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 heure en millisecondes

  /**
   * Récupère tous les épisodes de pollution depuis l'API
   */
  async fetchAllEpisodes(): Promise<PollutionEpisode[]> {
    // Vérifier le cache
    const now = Date.now();
    if (
      this.episodesCache &&
      now - this.lastFetchTime < this.CACHE_DURATION
    ) {
      return this.episodesCache;
    }

    try {
      const response = await fetch(this.API_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error(
          `Erreur HTTP: ${response.status} - ${response.statusText}`
        );
      }

      const data: PollutionEpisode[] = await response.json();
      
      // Mettre à jour le cache
      this.episodesCache = data;
      this.lastFetchTime = now;

      return data;
    } catch (error) {
      console.error("Erreur lors de la récupération des épisodes:", error);
      // Retourner le cache même s'il est expiré en cas d'erreur
      if (this.episodesCache) {
        return this.episodesCache;
      }
      throw error;
    }
  }

  /**
   * Filtre les épisodes selon le polluant sélectionné
   */
  filterEpisodesByPollutant(
    episodes: PollutionEpisode[],
    pollutantCode: string
  ): PollutionEpisode[] {
    // Mapping des codes de polluants de l'application vers les codes de l'API
    // L'API utilise des codes en majuscules : PM10, O3, etc.
    const pollutantMapping: Record<string, string[]> = {
      pm10: ["PM10"],
      pm25: ["PM25", "PM2.5"], // L'API pourrait utiliser PM25 ou PM2.5
      o3: ["O3"],
      no2: ["NO2"],
      so2: ["SO2"],
    };

    const apiCodes = pollutantMapping[pollutantCode.toLowerCase()] || [
      pollutantCode.toUpperCase(),
    ];

    return episodes.filter((episode) =>
      apiCodes.some((code) =>
        episode.polluant.toUpperCase() === code.toUpperCase()
      )
    );
  }

  /**
   * Filtre les épisodes selon la zone (optionnel)
   */
  filterEpisodesByZone(
    episodes: PollutionEpisode[],
    zoneCode?: string
  ): PollutionEpisode[] {
    if (!zoneCode) return episodes;
    return episodes.filter((episode) => episode.zone === zoneCode);
  }

  /**
   * Récupère les épisodes filtrés selon les critères
   */
  async getFilteredEpisodes(
    pollutantCode: string,
    zoneCode?: string
  ): Promise<PollutionEpisode[]> {
    const allEpisodes = await this.fetchAllEpisodes();
    let filtered = this.filterEpisodesByPollutant(allEpisodes, pollutantCode);
    
    if (zoneCode) {
      filtered = this.filterEpisodesByZone(filtered, zoneCode);
    }

    return filtered;
  }

  /**
   * Groupe les épisodes par date
   */
  groupEpisodesByDate(
    episodes: PollutionEpisode[]
  ): Map<string, PollutionEpisode[]> {
    const grouped = new Map<string, PollutionEpisode[]>();

    episodes.forEach((episode) => {
      const date = episode.date;
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(episode);
    });

    return grouped;
  }

  /**
   * Obtient le niveau d'alerte le plus élevé pour une date donnée
   */
  getHighestLevelForDate(
    episodes: PollutionEpisode[]
  ): { niveau: number; niveau_code: string; niveau_libelle: string } | null {
    if (episodes.length === 0) return null;

    // niveau: 1 = Information-recommandation, 2 = Alerte
    // Trier par niveau décroissant (2 > 1)
    const sorted = [...episodes].sort((a, b) => b.niveau - a.niveau);
    return {
      niveau: sorted[0].niveau,
      niveau_code: sorted[0].niveau_code,
      niveau_libelle: sorted[0].niveau_libelle,
    };
  }
}



