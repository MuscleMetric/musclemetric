import React, { useMemo } from "react";
import MapView, { Polyline } from "react-native-maps";
import { legs, type Point } from "./runMetrics";

export default function RouteMap({ points }: { points: Point[] }) {
  const paths = useMemo(() => legs(points), [points]);
  if (points.length < 2) return null;
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    north = Math.max(north, p.latitude); south = Math.min(south, p.latitude);
    east = Math.max(east, p.longitude); west = Math.min(west, p.longitude);
  }
  return <MapView style={{ height: 230, borderRadius: 12 }} accessibilityLabel="Private recorded route"
    initialRegion={{ latitude: (north + south) / 2, longitude: (east + west) / 2,
      latitudeDelta: Math.max(0.002, (north - south) * 1.3), longitudeDelta: Math.max(0.002, (east - west) * 1.3) }}>
    {paths.filter(path => path.length > 1).map(path => <Polyline key={path[0].time}
      coordinates={path.map(({ latitude, longitude }) => ({ latitude, longitude }))} strokeWidth={4} strokeColor="#2563EB" />)}
  </MapView>;
}
