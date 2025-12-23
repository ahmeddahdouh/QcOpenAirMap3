import L from "leaflet";

const STADIA_API_KEY = import.meta.env.VITE_STADIA_API_KEY;


if (!STADIA_API_KEY) {
  console.warn("⚠️ VITE_STADIA_API_KEY is missing");
}


export const baseLayers = {
  "Carte standard": L.tileLayer(
    `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
    {
      attribution:
        '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      pane: "tilePane",
      minZoom: 0,
      maxZoom: 20,
    }
  ),
  "Carte OSM": L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      pane: "tilePane",
      minZoom: 1,
      maxZoom: 19,
    }
  ),
  "Satellite IGN": L.tileLayer(
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    {
      attribution: '&copy; <a href="https://www.ign.fr/">IGN</a>',
      pane: "tilePane",
      minZoom: 1,
      maxZoom: 19,
    }
  ), 
};

export type BaseLayerKey = keyof typeof baseLayers;

// Types de layers de modélisation
export type ModelingLayerType = 
  | "icaireh"           // ICAIR'H (Modélisation multipolluant)
  | "pollutant"         // Modélisation polluant sélectionné
  | "vent";             // Vent

export const modelingLayers: Record<ModelingLayerType, string> = {
  icaireh: "ICAIR'H",
  pollutant: "Modélisation polluant sélectionné",
  vent: "Vent",
};
