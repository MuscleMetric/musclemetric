import React from "react";
import { render } from "@testing-library/react-native";
import RouteMap from "@/features/cardio/RouteMap.ios";

jest.mock("react-native-maps", () => ({
  __esModule: true, default: "MapView", Polyline: "Polyline",
}));

test("the route stays in a fixed map and a pause starts a separate line", () => {
  const points = [179.99, 179.995, -179.995, -179.99].map((longitude, i) => ({
    latitude: 1, longitude, time: i * 1000, accuracy: 4, leg: i < 2 ? 0 : 1, activeMs: i * 1000, meters: i * 2,
  }));
  const screen = render(<RouteMap points={points} />);
  const frame = screen.getByLabelText("Recorded workout route");
  expect(frame.props.pointerEvents).toBe("none");
  const map = frame.findByType("MapView" as React.ElementType);
  expect(map.props).toMatchObject({ scrollEnabled: false, zoomEnabled: false, pitchEnabled: false, rotateEnabled: false });
  expect(map.props.region.longitudeDelta).toBeCloseTo(0.026);
  expect(map.findAllByType("Polyline" as React.ElementType)).toHaveLength(2);
});
