import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { Polyline, type Region } from "react-native-maps";
import { legs, type Point } from "./runMetrics";

function routeRegion(points: Pick<Point, "latitude" | "longitude" | "leg">[]): Region {
  const origin = points[0].longitude;
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    north = Math.max(north, p.latitude); south = Math.min(south, p.latitude);
    const offset = ((p.longitude - origin + 540) % 360) - 180;
    east = Math.max(east, offset); west = Math.min(west, offset);
  }
  return {
    latitude: (north + south) / 2, longitude: ((origin + (east + west) / 2 + 540) % 360) - 180,
    latitudeDelta: Math.max(0.002, (north - south) * 1.3), longitudeDelta: Math.max(0.002, (east - west) * 1.3),
  };
}

function ZoomableRoute({ region, points }: { region: Region; points: Pick<Point, "latitude" | "longitude" | "leg">[] }) {
  const paths = useMemo(() => legs(points), [points]);
  const map = useRef<MapView>(null);
  const [limit, setLimit] = useState<number>();
  const measuring = useRef(false);
  // With pitch disabled, MapKit's camera altitude is its distance from the map centre.
  // Measure the actual fit including MapKit's aspect-ratio adjustment before enabling gestures.
  const measureOverview = async () => {
    if (limit !== undefined || measuring.current || !map.current) return;
    measuring.current = true;
    try {
      const camera = await map.current.getCamera();
      if (camera.altitude != null && Number.isFinite(camera.altitude) && camera.altitude > 0) setLimit(camera.altitude);
    } catch {
      // Keep the original overview if the native camera is not ready yet.
    } finally { measuring.current = false; }
  };
  return <MapView ref={map} style={{ flex: 1 }} accessibilityLabel="Recorded workout route"
    initialRegion={region} onMapReady={measureOverview} onRegionChangeComplete={measureOverview}
    zoomEnabled={limit !== undefined} cameraZoomRange={limit ? { maxCenterCoordinateDistance: limit } : undefined}
    scrollEnabled={false} rotateEnabled={false} pitchEnabled={false}>
    {paths.filter(path => path.length > 1).map(path => <Polyline key={path[0].leg}
      coordinates={path.map(({ latitude, longitude }) => ({ latitude, longitude }))} strokeWidth={4} strokeColor="#2563EB" />)}
  </MapView>;
}

export default function RouteMap({ points }: { points: Pick<Point, "latitude" | "longitude" | "leg">[] }) {
  const [width, setWidth] = useState(0);
  const region = useMemo(() => points.length >= 2 ? routeRegion(points) : null, [points]);
  if (!region) return null;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}
    style={{ height: 230, borderRadius: 12, overflow: "hidden" }}>
    {width > 0 && <ZoomableRoute key={[width, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta].join("/")}
      points={points} region={region} />}
  </View>;
}
