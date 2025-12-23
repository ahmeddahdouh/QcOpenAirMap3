import { WildfireReport } from "../types";

interface RawWildfireSignalement {
  id: number;
  title: string;
  lat: number;
  lng: number;
  type: string;
  commune: string;
  date: string;
  url: string;
  statut: string;
  etat_feu: string;
  post_status: string;
  description: string;
  post_modified: string;
}

interface WildfireApiResponse {
  signalements: RawWildfireSignalement[];
  meta: {
    total: number;
    timestamp: string;
    cache_duration: number;
  };
}

export class FeuxDeForetService {
  private static readonly BASE_URL =
    "https://feuxdeforet.fr/wp-json/fdf/v1/carte-signalements";

  async fetchTodaySignalements(): Promise<WildfireReport[]> {
    const timestamp = Date.now();
    const url = `${FeuxDeForetService.BASE_URL}?context=web&limit=100&format=minimal&_t=${timestamp}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Erreur API FeuxDeForet: ${response.status} ${response.statusText}`
      );
    }

    const data: WildfireApiResponse = await response.json();

    if (!data.signalements || !Array.isArray(data.signalements)) {
      return [];
    }

    const referenceDate = this.parseMetaTimestamp(data.meta?.timestamp) ?? new Date();
    const freshnessWindowMs = 48 * 60 * 60 * 1000; // 48 heures

    console.debug(
      "[FeuxDeForetService] Signalements reçus:",
      data.signalements.length,
      "| Timestamp meta:",
      data.meta?.timestamp,
      "| Date de référence:",
      referenceDate.toISOString()
    );

    return data.signalements
      .map((signalement) => this.transformSignalement(signalement))
      .filter((report) => {
        const isRecent = this.isReportRecent(
          report,
          referenceDate,
          freshnessWindowMs
        );

        if (!isRecent) {
          console.debug(
            "[FeuxDeForetService] Signalement ignoré (trop ancien):",
            report.id,
            {
              date: report.date,
              dateText: report.dateText,
              postModified: report.postModified,
              commune: report.commune,
            }
          );
        }

        return isRecent;
      });
  }

  private transformSignalement(
    signalement: RawWildfireSignalement
  ): WildfireReport {
    const parsedDate = this.parseDate(signalement.date);

    return {
      id: signalement.id,
      title: signalement.title,
      latitude: signalement.lat,
      longitude: signalement.lng,
      type: signalement.type,
      commune: signalement.commune,
      dateText: signalement.date,
      date: parsedDate,
      url: signalement.url,
      status: signalement.statut,
      fireState: signalement.etat_feu,
      postStatus: signalement.post_status,
      description: signalement.description,
      postModified: signalement.post_modified,
    };
  }

  private parseDate(dateText: string): string | null {
    if (!dateText) {
      return null;
    }

    const [datePart, timePart] = dateText.split(" ");

    if (!datePart) {
      return null;
    }

    const [dayStr, monthStr, yearStr] = datePart.split("/");

    if (!dayStr || !monthStr || !yearStr) {
      return null;
    }

    const day = Number.parseInt(dayStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const year = Number.parseInt(yearStr, 10);

    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
      return null;
    }

    let hours = 0;
    let minutes = 0;

    if (timePart) {
      const [hoursStr, minutesStr] = timePart.split(":");

      if (hoursStr) {
        hours = Number.parseInt(hoursStr, 10) || 0;
      }
      if (minutesStr) {
        minutes = Number.parseInt(minutesStr, 10) || 0;
      }
    }

    const parsedDate = new Date(year, month - 1, day, hours, minutes);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate.toISOString();
  }

  private parseMetaTimestamp(timestamp?: string): Date | null {
    if (!timestamp) {
      return null;
    }

    const normalized = timestamp.replace(" ", "T");
    const parsed = new Date(normalized);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isReportRecent(
    report: WildfireReport,
    referenceDate: Date,
    freshnessWindowMs: number
  ): boolean {
    const candidates: Array<string | null> = [
      report.date,
      report.postModified ? report.postModified.replace(" ", "T") : null,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const date = new Date(candidate);

      if (!Number.isNaN(date.getTime())) {
        const diff = referenceDate.getTime() - date.getTime();

        if (diff >= 0 && diff <= freshnessWindowMs) {
          console.debug(
            "[FeuxDeForetService] Signalement conservé:",
            report.id,
            {
              date: report.date,
              dateText: report.dateText,
              postModified: report.postModified,
              commune: report.commune,
              deltaMinutes: Math.round(diff / 60000),
            }
          );
          return true;
        }
      }
    }

    console.debug(
      "[FeuxDeForetService] Signalement ignoré (hors fenêtre):",
      report.id,
      {
        date: report.date,
        dateText: report.dateText,
        postModified: report.postModified,
        commune: report.commune,
      }
    );
    return false;
  }
}

