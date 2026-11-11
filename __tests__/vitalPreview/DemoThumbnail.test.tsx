import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { DemoThumbnail } from "@/features/vitalPreview/DemoThumbnail";

const mockGenerate = jest.fn();
const mockRelease = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-video", () => ({
  createVideoPlayer: () => ({
    replaceAsync: mockReplace,
    generateThumbnailsAsync: mockGenerate,
    release: mockRelease,
  }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("lucide-react-native", () => ({ Play: () => null }));

beforeEach(() => {
  mockReplace.mockResolvedValue(undefined);
  mockGenerate.mockImplementation(async (times: unknown) => {
    // Model the native array contract, not the looser TypeScript signature.
    if (!Array.isArray(times)) throw new Error("Native bridge requires an array");
    return [];
  });
});

it("passes an array of timestamps to the native thumbnail extractor", async () => {
  render(<DemoThumbnail source={9101} />);
  await waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
  expect(mockReplace).toHaveBeenCalledWith(9101);
  expect(mockGenerate).toHaveBeenCalledWith([0.5], {
    maxWidth: 160,
    maxHeight: 160,
  });
});

it("releases the extractor when thumbnail generation fails", async () => {
  mockGenerate.mockRejectedValue(new Error("Unreadable video"));
  render(<DemoThumbnail source={9102} />);
  await waitFor(() => expect(mockRelease).toHaveBeenCalledTimes(1));
});
