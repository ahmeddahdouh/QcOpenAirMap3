import React, { useRef } from "react";
import { Marker, Polyline, CircleMarker } from "react-leaflet";
import { SignalAirReport } from "../../types";
import { useSignalAirSpiderfier } from "../../hooks/useSignalAirSpiderfier";

interface CustomSpiderfiedSignalAirMarkersProps {
  reports: SignalAirReport[];
  createSignalIcon: (report: SignalAirReport) => any;
  handleMarkerClick: (report: SignalAirReport) => void;
  enabled: boolean;
  zoomThreshold?: number;
}

const CustomSpiderfiedSignalAirMarkers: React.FC<CustomSpiderfiedSignalAirMarkersProps> = ({
  reports,
  createSignalIcon,
  handleMarkerClick,
  enabled,
  zoomThreshold = 12,
}) => {
  const markerRefs = useRef<Map<string, any>>(new Map());
  const {
    getMarkerPosition,
    isMarkerSpiderfied,
    getSpiderfiedData,
    spiderfiedMarkers,
    groupCenters,
  } = useSignalAirSpiderfier({
    reports,
    enabled,
    zoomThreshold,
  });

  return (
    <>
      {/* Marqueurs normaux ou éclatés */}
      {reports.map((report) => {
        const position = getMarkerPosition(report);
        const isSpiderfied = isMarkerSpiderfied(report);
        const spiderfiedData = getSpiderfiedData(report);

        return (
          <React.Fragment key={report.id}>
            <Marker
              position={position}
              icon={createSignalIcon(report)}
              eventHandlers={{
                click: () => {
                  handleMarkerClick(report);
                },
              }}
              ref={(marker) => {
                if (marker) {
                  markerRefs.current.set(report.id, marker);
                } else {
                  markerRefs.current.delete(report.id);
                }
              }}
            />

            {/* Trait de connexion pour les marqueurs éclatés */}
            {isSpiderfied && spiderfiedData && (
              <Polyline
                positions={[
                  spiderfiedData.originalPosition,
                  spiderfiedData.spiderfiedPosition,
                ]}
                color="#3388ff"
                weight={2}
                opacity={0.8}
                dashArray="5, 5"
                interactive={false}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Points centraux pour indiquer l'emplacement initial des groupes éclatés */}
      {groupCenters.map(([groupIndex, centerPosition]) => (
        <CircleMarker
          key={`center-${groupIndex}`}
          center={centerPosition}
          radius={3}
          color="#3388ff"
          weight={1}
          opacity={0.6}
          fillColor="#3388ff"
          fillOpacity={0.4}
          interactive={false}
        />
      ))}
    </>
  );
};

export default CustomSpiderfiedSignalAirMarkers;

