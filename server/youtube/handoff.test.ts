import { afterEach, describe, expect, it } from "vitest";
import { parseHandoffManifest } from "./handoff";

const previousLimit = process.env.YOUTUBE_HANDOFF_MAX_BYTES;

afterEach(() => {
  if (previousLimit === undefined) delete process.env.YOUTUBE_HANDOFF_MAX_BYTES;
  else process.env.YOUTUBE_HANDOFF_MAX_BYTES = previousLimit;
});

describe("YouTube handoff manifest", () => {
  const valid = {
    productionId: "010_sample_video",
    fileName: "010_sample_video.mp4",
    fileSizeBytes: 1024,
    sha256: "a".repeat(64),
    qaStatus: "PASS",
  };

  it("accepts a complete QA-PASS manifest", () => {
    expect(parseHandoffManifest(valid)).toEqual({ ...valid, sha256: "a".repeat(64) });
  });

  it("rejects failed or warning QA states", () => {
    expect(parseHandoffManifest({ ...valid, qaStatus: "FAIL" })).toBeNull();
    expect(parseHandoffManifest({ ...valid, qaStatus: "PASS WITH WARNINGS" })).toBeNull();
  });

  it("requires the filename to match the production ID", () => {
    expect(parseHandoffManifest({ ...valid, fileName: "other.mp4" })).toBeNull();
  });

  it("rejects invalid hashes and unsafe sizes", () => {
    expect(parseHandoffManifest({ ...valid, sha256: "not-a-hash" })).toBeNull();
    expect(parseHandoffManifest({ ...valid, fileSizeBytes: 0 })).toBeNull();
    process.env.YOUTUBE_HANDOFF_MAX_BYTES = "100";
    expect(parseHandoffManifest(valid)).toBeNull();
  });

  it("rejects path-like production IDs", () => {
    expect(parseHandoffManifest({ ...valid, productionId: "../video" })).toBeNull();
  });
});
