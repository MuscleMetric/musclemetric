import type { Point } from "./runMetrics";
// The recorder is iOS-only. Metro resolves the MapKit implementation on iPhone.
export default function RouteMap(_: { points: Pick<Point, "latitude" | "longitude" | "leg">[] }) { return null; }
