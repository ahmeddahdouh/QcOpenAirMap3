/**
 * Hook pour gérer la création et la mise à jour du graphique amCharts
 */

import { useEffect, useRef } from "react";
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { QUALITY_COLORS } from "../../../constants/qualityColors";
import { SeriesConfig } from "../utils/historicalChartConfig";
import { createLineSeries, addThresholdZones, setupLegend } from "../utils/amChartsHelpers";

interface UseAmChartsChartProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerId: string;
  chartData: any[];
  amChartsData: any[];
  seriesConfigs: SeriesConfig[];
  unitKeys: string[];
  commonThresholds: any | null;
  xAxisDateFormat: { type: string; format: (date: Date) => string };
  chartMargins: { top: number; right: number; left: number; bottom: number };
  isMobile: boolean;
  isLandscapeMobile: boolean;
  stationInfo: any | null;
  timeStep?: string;
}

export const useAmChartsChart = ({
  containerRef,
  containerId,
  chartData,
  amChartsData,
  seriesConfigs,
  unitKeys,
  commonThresholds,
  xAxisDateFormat,
  chartMargins,
  isMobile,
  isLandscapeMobile,
  stationInfo,
  timeStep,
}: UseAmChartsChartProps) => {
  const chartRef = useRef<am5xy.XYChart | null>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const xAxisDateFormatRef = useRef<{ format: (date: Date) => string } | null>(null);

  // Mettre à jour la ref du formatter quand xAxisDateFormat change
  useEffect(() => {
    xAxisDateFormatRef.current = xAxisDateFormat;
  }, [xAxisDateFormat]);

  // Création initiale du graphique
  useEffect(() => {
    if (!containerRef.current) {
      console.warn("[HistoricalChart] Conteneur DOM non disponible");
      return;
    }

    if (!chartData || chartData.length === 0) {
      console.warn("[HistoricalChart] Aucune donnée à afficher");
      return;
    }

    if (rootRef.current && chartRef.current) {
      return;
    }

    // Créer le root amCharts
    const root = am5.Root.new(containerId);
    rootRef.current = root;

    // Appliquer le thème animé
    root.setThemes([am5themes_Animated.new(root)]);

    // Créer le graphique XY
    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: true,
        panY: false,
        wheelX: "panX",
        wheelY: "zoomX",
        pinchZoomX: true,
        layout: root.verticalLayout,
        paddingTop: chartMargins.top,
        paddingRight: chartMargins.right,
        paddingBottom: chartMargins.bottom,
        paddingLeft: chartMargins.left,
      })
    );
    chartRef.current = chart;

    // Créer l'axe X (dates)
    // IMPORTANT: baseInterval doit correspondre à la granularité des données
    // pour que les gaps fonctionnent correctement avec connect: false
    let baseInterval: { timeUnit: "minute" | "hour" | "day" | "second"; count: number };
    if (timeStep === "quartHeure") {
      baseInterval = { timeUnit: "minute", count: 15 };
    } else if (timeStep === "heure") {
      baseInterval = { timeUnit: "hour", count: 1 };
    } else if (timeStep === "jour") {
      baseInterval = { timeUnit: "day", count: 1 };
    } else {
      // Par défaut, utiliser la seconde pour les données non agrégées
      baseInterval = { timeUnit: "second", count: 1 };
    }
    
    const xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        baseInterval: baseInterval,
        renderer: am5xy.AxisRendererX.new(root, {
          minGridDistance: isMobile ? 70 : 50,
          cellStartLocation: 0,
          cellEndLocation: 1,
        }),
      })
    );

    // Configurer la grille verticale
    xAxis.get("renderer").grid.template.setAll({
      stroke: am5.color("#e0e0e0"),
      strokeDasharray: [3, 3],
      location: 0,
      strokeOpacity: 0.5,
    });

    // Formatter personnalisé pour l'axe X
    xAxis.get("renderer").labels.template.adapters.add("text", (text, target) => {
      if (target.dataItem) {
        const value = (target.dataItem as any).get("value");
        if (value) {
          const date = typeof value === "number" ? new Date(value) : new Date(String(value));
          if (!isNaN(date.getTime()) && xAxisDateFormatRef.current) {
            return xAxisDateFormatRef.current.format(date);
          }
        }
      }
      return text;
    });

    // Configurer la taille de police et la rotation selon le mode
    xAxis.get("renderer").labels.template.setAll({
      fontSize: isMobile ? 7 : isLandscapeMobile ? 9 : 12,
      fill: am5.color("#666"),
      rotation: isMobile ? 0 : -45,
      centerY: am5.p50,
      centerX: am5.p50,
    });

    // Créer les axes Y
    const yAxisMap = new Map<string, am5xy.ValueAxis<am5xy.AxisRendererY>>();

    unitKeys.forEach((unit, unitIndex) => {
      const yAxisId = unitIndex === 0 ? "left" : "right";
      const yAxis = chart.yAxes.push(
        am5xy.ValueAxis.new(root, {
          id: yAxisId,
          renderer: am5xy.AxisRendererY.new(root, {
            opposite: yAxisId === "right",
          }),
        })
      );

      // Ajouter le label
      yAxis.children.push(
        am5.Label.new(root, {
          rotation: -90,
          text: `Conc. (${unit})`,
          y: am5.p50,
          centerX: am5.p50,
          fontSize: isMobile ? 8 : isLandscapeMobile ? 10 : 12,
        })
      );

      // Configurer la taille de police
      yAxis.get("renderer").labels.template.setAll({
        fontSize: isMobile ? 9 : isLandscapeMobile ? 10 : 12,
      });

      yAxisMap.set(yAxisId, yAxis as am5xy.ValueAxis<am5xy.AxisRendererY>);
    });

    // Configurer la grille horizontale
    yAxisMap.forEach((yAxis) => {
      yAxis.get("renderer").grid.template.setAll({
        stroke: am5.color("#e0e0e0"),
        strokeDasharray: [3, 3],
      });
    });

    // Ajouter les zones colorées des seuils
    if (commonThresholds) {
      addThresholdZones(yAxisMap, commonThresholds);
    }

    // Créer les séries de données
    seriesConfigs.forEach((seriesConfig) => {
      const yAxis = yAxisMap.get(seriesConfig.yAxisId);
      if (!yAxis) {
        console.warn(`[HistoricalChart] Axe Y "${seriesConfig.yAxisId}" non trouvé pour la série "${seriesConfig.dataKey}"`);
        return;
      }

      createLineSeries(root, chart, xAxis as am5xy.DateAxis<am5xy.AxisRendererX>, yAxis, seriesConfig, amChartsData, timeStep);
    });

    // Créer le curseur
    const cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
      behavior: "zoomXY",
      xAxis: xAxis,
    }));
    
    if (chart.series.length > 0) {
      cursor.set("snapToSeries", chart.series.values);
    }
    cursor.lineY.set("visible", false);
    cursor.lineX.set("visible", true);

    // Créer la légende
    setupLegend(root, chart, seriesConfigs, isMobile);

    // Nettoyage au démontage
    return () => {
      if (rootRef.current) {
        rootRef.current.dispose();
        rootRef.current = null;
        chartRef.current = null;
      }
    };
  }, []); // Création initiale uniquement

  // Mise à jour des données sans recréer le graphique
  useEffect(() => {
    if (!chartRef.current || !rootRef.current || !amChartsData.length) return;

    const chart = chartRef.current;
    const xAxis = chart.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRendererX>;
    if (!xAxis) return;

    // Préserver l'état du zoom
    let zoomStart: number | undefined;
    let zoomEnd: number | undefined;
    try {
      const start = (xAxis as any).getPrivate("start");
      const end = (xAxis as any).getPrivate("end");
      if (start !== undefined && end !== undefined) {
        zoomStart = start as number;
        zoomEnd = end as number;
      }
    } catch (e) {
      // Ignorer si on ne peut pas récupérer le zoom
    }

    // Mettre à jour les données de chaque série
    chart.series.values.forEach((lineSeries) => {
      (lineSeries as am5xy.LineSeries).data.setAll(amChartsData);
    });

    // Restaurer le zoom
    if (zoomStart !== undefined && zoomEnd !== undefined) {
      xAxis.zoomToDates(new Date(zoomStart), new Date(zoomEnd));
    }
  }, [amChartsData]);

  // Mise à jour des séries (quand la configuration change)
  useEffect(() => {
    if (!chartRef.current || !rootRef.current || !seriesConfigs.length) return;

    const chart = chartRef.current;
    const xAxis = chart.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRendererX>;
    const yAxisMap = new Map<string, am5xy.ValueAxis<am5xy.AxisRendererY>>();
    
    chart.yAxes.values.forEach((yAxis) => {
      const id = (yAxis as any).get("id");
      if (id) {
        yAxisMap.set(id, yAxis as am5xy.ValueAxis<am5xy.AxisRendererY>);
      }
    });

    // Retirer la référence du curseur aux séries avant de les supprimer
    const cursor = chart.get("cursor") as am5xy.XYCursor;
    if (cursor) {
      cursor.set("snapToSeries", []);
    }

    // Supprimer toutes les séries existantes
    chart.series.clear();

    // Recréer les séries avec la nouvelle configuration
    // IMPORTANT: Passer timeStep pour que connect: false soit appliqué pour les pas de temps agrégés
    seriesConfigs.forEach((seriesConfig) => {
      const yAxis = yAxisMap.get(seriesConfig.yAxisId);
      if (!yAxis) return;

      createLineSeries(rootRef.current!, chart, xAxis as am5xy.DateAxis<am5xy.AxisRendererX>, yAxis, seriesConfig, amChartsData, timeStep);
    });

    // Remettre la référence du curseur aux nouvelles séries
    if (cursor) {
      cursor.set("snapToSeries", chart.series.values);
    }

    // Mettre à jour la légende
    chart.children.each((child) => {
      if (child instanceof am5.Legend) {
        const legend = child as am5.Legend;
        legend.data.setAll(chart.series.values);
      }
    });
  }, [seriesConfigs, amChartsData, timeStep]);

  // Mise à jour des zones de seuils
  useEffect(() => {
    if (!chartRef.current || !rootRef.current) return;

    const chart = chartRef.current;
    const yAxisMap = new Map<string, am5xy.ValueAxis<am5xy.AxisRendererY>>();
    
    chart.yAxes.values.forEach((yAxis) => {
      const id = (yAxis as any).get("id");
      if (id) {
        yAxisMap.set(id, yAxis as am5xy.ValueAxis<am5xy.AxisRendererY>);
      }
    });

    // Supprimer toutes les zones existantes
    yAxisMap.forEach((yAxis) => {
      yAxis.axisRanges.clear();
    });

    // Ajouter les nouvelles zones si les seuils sont communs
    if (commonThresholds) {
      addThresholdZones(yAxisMap, commonThresholds);
    }
  }, [commonThresholds]);

  // Mise à jour des marges et des propriétés de l'axe X lors des changements d'orientation
  useEffect(() => {
    if (!chartRef.current || !rootRef.current) return;

    const chart = chartRef.current;
    const xAxis = chart.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRendererX>;
    
    if (!xAxis) return;

    // Mettre à jour les paddings du graphique
    chart.set("paddingTop", chartMargins.top);
    chart.set("paddingRight", chartMargins.right);
    chart.set("paddingBottom", chartMargins.bottom);
    chart.set("paddingLeft", chartMargins.left);

    // Mettre à jour le minGridDistance de l'axe X
    const renderer = xAxis.get("renderer") as am5xy.AxisRendererX;
    if (renderer) {
      renderer.set("minGridDistance", isMobile ? 70 : 50);
    }

    // Mettre à jour la taille de police des labels de l'axe X
    xAxis.get("renderer").labels.template.setAll({
      fontSize: isMobile ? 7 : isLandscapeMobile ? 9 : 12,
    });
  }, [chartMargins, isMobile, isLandscapeMobile]);

  return {
    chartRef: chartRef as React.RefObject<am5xy.XYChart | null>,
    rootRef: rootRef as React.RefObject<am5.Root | null>,
  };
};

