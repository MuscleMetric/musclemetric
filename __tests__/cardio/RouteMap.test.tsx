import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { View } from "react-native";
import MapView from "react-native-maps";
import RouteMap from "@/features/cardio/RouteMap.ios";

const mockGetCamera = jest.fn();
jest.mock("react-native-maps", () => {
  const React = jest.requireActual("react");
  return { __esModule: true, Polyline: "Polyline",
    default: React.forwardRef(function MockMap(props: object, ref: React.Ref<unknown>) {
      React.useImperativeHandle(ref, () => ({ getCamera: mockGetCamera }));
      return React.createElement("MapView", props);
    }),
  };
});

test("pinching can zoom back to the fitted route but never beyond the opening camera distance", async () => {
  mockGetCamera.mockResolvedValue({ altitude: 1750 });
  const points = [179.99, 179.995, -179.995, -179.99].map((longitude, i) => ({
    latitude: 1, longitude, time: i * 1000, accuracy: 4, leg: i < 2 ? 0 : 1, activeMs: i * 1000, meters: i * 2,
  }));
  const screen = render(<RouteMap points={points} />);
  fireEvent(screen.UNSAFE_getByType(View), "layout", { nativeEvent: { layout: { width: 320 } } });
  const map = screen.UNSAFE_getByType(MapView);
  expect(map.props.initialRegion.longitudeDelta).toBeCloseTo(0.026);
  expect(map.props.zoomEnabled).toBe(false);
  await act(async () => map.props.onMapReady());
  await waitFor(() => expect(map.props.zoomEnabled).toBe(true));
  expect(map.props).toMatchObject({ scrollEnabled: false, pitchEnabled: false, rotateEnabled: false,
    cameraZoomRange: { maxCenterCoordinateDistance: 1750 } });
  await act(async () => map.props.onRegionChangeComplete());
  expect(mockGetCamera).toHaveBeenCalledTimes(1);
  expect(map.findAllByType("Polyline" as React.ElementType)).toHaveLength(2);
});
