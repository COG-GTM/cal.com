import { describe, expect, it } from "vitest";
import { deriveAppDictKeyFromType } from "./deriveAppDictKeyFromType";

describe("deriveAppDictKeyFromType", () => {
  it("returns the appType as is when present in the dict", () => {
    expect(deriveAppDictKeyFromType("dailyvideo", { dailyvideo: {} })).toBe("dailyvideo");
  });

  it("strips the category suffix (zoom_video -> zoom)", () => {
    expect(deriveAppDictKeyFromType("zoom_video", { zoom: {} })).toBe("zoom");
  });

  it("removes only the last underscore (zoom_video -> zoomvideo)", () => {
    expect(deriveAppDictKeyFromType("zoom_video", { zoomvideo: {} })).toBe("zoomvideo");
  });

  it("removes all underscores as a last resort", () => {
    expect(deriveAppDictKeyFromType("hubspot_other_calendar", { hubspotothercalendar: {} })).toBe(
      "hubspotothercalendar"
    );
  });

  it("prefers the exact match over derived variants", () => {
    expect(deriveAppDictKeyFromType("zoom_video", { zoom_video: {}, zoom: {} })).toBe("zoom_video");
  });

  it("returns the original appType when no variant matches", () => {
    expect(deriveAppDictKeyFromType("unknown_app", { other: {} })).toBe("unknown_app");
  });
});
