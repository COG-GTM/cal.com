import { describe, expect, it } from "vitest";
import { FeatureDtoArraySchema, FeatureDtoSchema } from "./FeatureDto";
import { TeamFeaturesDtoSchema } from "./TeamFeaturesDto";
import { UserFeaturesDtoSchema } from "./UserFeaturesDto";

const feature = {
  slug: "insights",
  enabled: true,
  description: "Insights dashboard",
  type: "RELEASE",
  stale: false,
  lastUsedAt: "2024-03-13T10:00:00.000Z",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-02-01T00:00:00.000Z",
  updatedBy: 1,
};

describe("FeatureDtoSchema", () => {
  it("coerces date strings into dates", () => {
    const parsed = FeatureDtoSchema.parse(feature);

    expect(parsed.lastUsedAt).toBeInstanceOf(Date);
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.updatedAt).toBeInstanceOf(Date);
  });

  it("allows the nullable fields to be null", () => {
    const parsed = FeatureDtoSchema.parse({
      ...feature,
      description: null,
      type: null,
      stale: null,
      lastUsedAt: null,
      createdAt: null,
      updatedAt: null,
      updatedBy: null,
    });

    expect(parsed.type).toBeNull();
    expect(parsed.updatedBy).toBeNull();
  });

  it("rejects an unknown feature type", () => {
    expect(FeatureDtoSchema.safeParse({ ...feature, type: "UNKNOWN" }).success).toBe(false);
  });

  it("rejects a missing slug", () => {
    const { slug: _slug, ...withoutSlug } = feature;

    expect(FeatureDtoSchema.safeParse(withoutSlug).success).toBe(false);
  });

  it("parses a list of features", () => {
    expect(FeatureDtoArraySchema.parse([feature])).toHaveLength(1);
    expect(FeatureDtoArraySchema.safeParse(feature).success).toBe(false);
  });
});

describe("TeamFeaturesDtoSchema", () => {
  it("parses a team feature assignment", () => {
    const parsed = TeamFeaturesDtoSchema.parse({
      teamId: 1,
      featureId: "insights",
      enabled: true,
      assignedBy: "admin",
      updatedAt: "2024-03-13T10:00:00.000Z",
    });

    expect(parsed.teamId).toBe(1);
    expect(parsed.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a non numeric teamId", () => {
    expect(
      TeamFeaturesDtoSchema.safeParse({
        teamId: "1",
        featureId: "insights",
        enabled: true,
        assignedBy: "admin",
        updatedAt: new Date(),
      }).success
    ).toBe(false);
  });
});

describe("UserFeaturesDtoSchema", () => {
  it("parses a user feature assignment", () => {
    const parsed = UserFeaturesDtoSchema.parse({
      userId: 2,
      featureId: "insights",
      enabled: false,
      assignedBy: "admin",
      updatedAt: new Date("2024-03-13T10:00:00.000Z"),
    });

    expect(parsed.userId).toBe(2);
    expect(parsed.enabled).toBe(false);
  });

  it("rejects a missing userId", () => {
    expect(
      UserFeaturesDtoSchema.safeParse({
        featureId: "insights",
        enabled: true,
        assignedBy: "admin",
        updatedAt: new Date(),
      }).success
    ).toBe(false);
  });
});
