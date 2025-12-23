import { Pollutant } from "../types";

// Configuration des seuils pour les particules fines PM1 et PM2.5
export const seuilsPm1Pm25 = {
  bon: { code: "bon", min: 0, max: 6 },
  moyen: { code: "moyen", min: 6, max: 16 },
  degrade: { code: "degrade", min: 16, max: 51 },
  mauvais: { code: "mauvais", min: 51, max: 91 },
  tresMauvais: { code: "tresMauvais", min: 91, max: 141 },
  extrMauvais: { code: "extrMauvais", min: 141, max: 9999 },
};

// Configuration des seuils pour les particules fines PM10
export const seuilsPm10 = {
  bon: { code: "bon", min: 0, max: 16 },
  moyen: { code: "moyen", min: 16, max: 46 },
  degrade: { code: "degrade", min: 46, max: 121 },
  mauvais: { code: "mauvais", min: 121, max: 196 },
  tresMauvais: { code: "tresMauvais", min: 196, max: 271 },
  extrMauvais: { code: "extrMauvais", min: 271, max: 10000 },
};

// Configuration des seuils pour le dioxyde d'azote (NO2)
export const seuilsNo2 = {
  bon: { code: "bon", min: 0, max: 10 },
  moyen: { code: "moyen", min: 10, max: 25 },
  degrade: { code: "degrade", min: 25, max: 60 },
  mauvais: { code: "mauvais", min: 60, max: 100 },
  tresMauvais: { code: "tresMauvais", min: 100, max: 150 },
  extrMauvais: { code: "extrMauvais", min: 150, max: 9999 },
};

// Configuration des seuils pour l'ozone (O3)
export const seuilsO3 = {
  bon: { code: "bon", min: 0, max: 60 },
  moyen: { code: "moyen", min: 60, max: 100 },
  degrade: { code: "degrade", min: 100, max: 120 },
  mauvais: { code: "mauvais", min: 120, max: 160 },
  tresMauvais: { code: "tresMauvais", min: 160, max: 180 },
  extrMauvais: { code: "extrMauvais", min: 180, max: 9999 },
};

// Configuration des seuils pour le dioxyde de soufre (SO2)
export const seuilsSo2 = {
  bon: { code: "bon", min: 0, max: 20 },
  moyen: { code: "moyen", min: 20, max: 40 },
  degrade: { code: "degrade", min: 40, max: 125 },
  mauvais: { code: "mauvais", min: 125, max: 190 },
  tresMauvais: { code: "tresMauvais", min: 190, max: 275 },
  extrMauvais: { code: "extrMauvais", min: 275, max: 9999 },
};

// Configuration des seuils pour le bruit (valeurs indicatives en dB(A))
export const seuilsBruit = {
  bon: { code: "bon", min: 0, max: 55 },
  moyen: { code: "moyen", min: 55, max: 65 },
  degrade: { code: "degrade", min: 65, max: 75 },
  mauvais: { code: "mauvais", min: 75, max: 85 },
  tresMauvais: { code: "tresMauvais", min: 85, max: 95 },
  extrMauvais: { code: "extrMauvais", min: 95, max: 150 },
};

// Configuration des seuils pour le CO2 (valeurs en ppm)
export const seuilsCo2 = {
  bon: { code: "bon", min: 0, max: 600 },
  moyen: { code: "moyen", min: 600, max: 1000 },
  degrade: { code: "degrade", min: 1000, max: 1500 },
  mauvais: { code: "mauvais", min: 1500, max: 2500 },
  tresMauvais: { code: "tresMauvais", min: 2500, max: 5000 },
  extrMauvais: { code: "extrMauvais", min: 5000, max: 10000 },
};

export const pollutants: Record<string, Pollutant> = {
  pm1: {
    name: "PM₁",
    code: "pm1",
    unit: "µg/m³",
    thresholds: seuilsPm1Pm25,
  },
  pm25: {
    name: "PM₂.₅",
    code: "pm25",
    unit: "µg/m³",
    thresholds: seuilsPm1Pm25,
  },
  pm10: {
    name: "PM₁₀",
    code: "pm10",
    unit: "µg/m³",
    thresholds: seuilsPm10,
  },
  no2: {
    name: "NO₂",
    code: "no2",
    unit: "µg/m³",
    thresholds: seuilsNo2,
  },
  so2: {
    name: "SO₂",
    code: "so2",
    unit: "µg/m³",
    thresholds: seuilsSo2,
  },
  o3: {
    name: "O₃",
    code: "o3",
    unit: "µg/m³",
    thresholds: seuilsO3,
  },
  bruit: {
    name: "Bruit",
    code: "bruit",
    unit: "dB(A)",
    thresholds: seuilsBruit,
    supportedTimeSteps: ["instantane", "deuxMin"],
  },
  co2: {
    name: "CO₂",
    code: "co2",
    unit: "ppm",
    thresholds: seuilsCo2,
  },
};

// Configuration des polluants avec leur état d'activation
export const mesures = {
  pm1: { name: "PM₁", code: "pm1", activated: false }, // Particules fines de diamètre inférieur à 1 µm
  pm25: { name: "PM₂.₅", code: "pm25", activated: true }, // Particules fines de diamètre inférieur à 2.5 µm
  pm10: { name: "PM₁₀", code: "pm10", activated: false }, // Particules fines de diamètre inférieur à 10 µm
  no2: { name: "NO₂", code: "no2", activated: false }, // Dioxyde d'azote
  so2: { name: "SO₂", code: "so2", activated: false }, // Dioxyde de soufre
  o3: { name: "O₃", code: "o3", activated: false }, // Ozone
  bruit: { name: "Bruit", code: "bruit", activated: false }, // Bruit environnemental
  co2: { name: "CO₂", code: "co2", activated: true }, // Dioxyde de carbone
};

// Fonction pour obtenir le polluant par défaut
export const getDefaultPollutant = (): string => {
  const defaultPollutant = Object.entries(mesures).find(
    ([_, config]) => config.activated
  );
  return defaultPollutant ? defaultPollutant[0] : "pm25";
};

// Définition des couleurs pour les polluants dans les graphiques
export const POLLUTANT_COLORS = {
  pm1: "#b7cee5",
  pm25: "#66b2ff",
  pm10: "#0066cc",
  no2: "#A133FF",
  o3: "#f5d045",
  so2: "#D4A5A5",
  h2s: "#9B59B6",
  nh3: "#3498DB",
  bruit: "#FF8C42",
  co2: "#FF5733",
};

export const isPollutantSupportedForTimeStep = (
  pollutantCode: string,
  timeStep: string
): boolean => {
  const pollutant = pollutants[pollutantCode];
  if (!pollutant) return false;
  if (!pollutant.supportedTimeSteps || pollutant.supportedTimeSteps.length === 0)
    return true;
  return pollutant.supportedTimeSteps.includes(timeStep);
};

export const getSupportedPollutantsForTimeStep = (
  timeStep: string
): string[] => {
  return Object.entries(pollutants)
    .filter(([, pollutant]) => {
      if (!pollutant.supportedTimeSteps || pollutant.supportedTimeSteps.length === 0)
        return true;
      return pollutant.supportedTimeSteps.includes(timeStep);
    })
    .map(([code]) => code);
};
