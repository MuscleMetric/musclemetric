import React, { useMemo } from "react";
import { View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { legs, type Point } from "./runMetrics";

export default function RouteMap({ points }: { points: Point[] }) {
  const paths = useMemo(() => legs(points), [points]);
  if (points.length < 2) return null;
  const origin = points[0].longitude;
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    north = Math.max(north, p.latitude); south = Math.min(south, p.latitude);
    const offset = ((p.longitude - origin + 540) % 360) - 180;
    east = Math.max(east, offset); west = Math.min(west, offset);
  }
  return <View pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel="Recorded workout route"
    style={{ height: 230, borderRadius: 12, overflow: "hidden" }}>
    <MapView style={{ flex: 1 }} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
      region={{ latitude: (north + south) / 2, longitude: ((origin + (east + west) / 2 + 540) % 360) - 180,
        latitudeDelta: Math.max(0.002, (north - south) * 1.3), longitudeDelta: Math.max(0.002, (east - west) * 1.3) }}>
      {paths.filter(path => path.length > 1).map(path => <Polyline key={path[0].time}
        coordinates={path.map(({ latitude, longitude }) => ({ latitude, longitude }))} strokeWidth={4} strokeColor="#2563EB" />)}
    </MapView>
  </View>;
}
