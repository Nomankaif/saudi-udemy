import type { PbqArea } from "./types";

// Older questions only stored a centre point. Give them a usable device-sized hit area.
export function hotspotBounds(area: Pick<PbqArea, "x" | "y" | "width" | "height">) {
  const width = Math.max(1, Math.min(100, area.width ?? 8));
  const height = Math.max(1, Math.min(100, area.height ?? 14));
  return {
    left: Math.max(0, Math.min(100 - width, area.x - width / 2)),
    top: Math.max(0, Math.min(100 - height, area.y - height / 2)),
    width, height,
  };
}

export function elementName(label: string) {
  return !label.trim() || /^(location|area)\s*\d+$/i.test(label.trim()) ? "Diagram element" : label;
}
