import type { CalendarEvent } from "@calcom/types/Calendar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DailyVideoApiAdapter, {
  generateGuestMeetingTokenFromOwnerMeetingToken,
  getBatchProcessorJobAccessLink,
  getRoomNameFromRecordingId,
  setEnableRecordingUIAndUserIdForOrganizer,
  updateMeetingTokenIfExpired,
} from "../VideoApiAdapter";

const { fetcher, getDailyAppKeys } = vi.hoisted(() => ({
  fetcher: vi.fn(),
  getDailyAppKeys: vi.fn(),
}));

vi.mock("../dailyApiFetcher", () => ({ fetcher: (...args: unknown[]) => fetcher(...args) }));
vi.mock("@calcom/app-store/dailyvideo/lib/getDailyAppKeys", () => ({
  getDailyAppKeys: () => getDailyAppKeys(),
}));

const prismaMock = vi.hoisted(() => ({
  membership: { findFirst: vi.fn() },
  bookingReference: { update: vi.fn() },
}));

vi.mock("@calcom/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

const room = {
  id: "room-id",
  name: "room-name",
  api_created: true,
  privacy: "public" as const,
  url: "https://cal.daily.co/room-name",
  created_at: "2024-01-01T00:00:00.000Z",
  config: {
    exp: 1_700_000_000,
    enable_chat: true,
    enable_knocking: true,
    enable_prejoin_ui: true,
    enable_pip_ui: true,
  },
};

const recordingItem = {
  id: "recording-1",
  room_name: "room-name",
  start_ts: 1_700_000_000,
  status: "finished",
  duration: 120,
  share_token: "share-token",
};

const event = {
  uid: "booking-uid",
  endTime: "2024-01-01T10:00:00.000Z",
  organizer: { id: 1, email: "organizer@example.com", name: "Organizer", timeZone: "UTC", language: {} },
} as unknown as CalendarEvent;

/** Routes fetcher calls by endpoint so each test only declares the responses it cares about. */
function mockEndpoints(routes: Record<string, unknown>) {
  fetcher.mockImplementation((endpoint: string) => {
    const match = Object.keys(routes).find((route) => endpoint.startsWith(route));
    if (!match) return Promise.reject(new Error(`Unexpected endpoint ${endpoint}`));
    const response = routes[match];
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });
}

describe("DailyVideoApiAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDailyAppKeys.mockResolvedValue({ api_key: "daily-key", scale_plan: "false" });
    prismaMock.membership.findFirst.mockResolvedValue(null);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("createMeeting", () => {
    it("creates a room and an owner meeting token", async () => {
      mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });

      const result = await DailyVideoApiAdapter().createMeeting(event);

      expect(result).toEqual({
        type: "daily_video",
        id: "room-name",
        password: "owner-token",
        url: room.url,
      });
      const [, roomInit] = fetcher.mock.calls[0];
      const body = JSON.parse(roomInit.body);
      expect(body.privacy).toBe("public");
      // 14 days after the booking ends
      expect(body.properties.exp).toBe(
        Math.round(new Date(event.endTime).getTime() / 1000) + 60 * 60 * 24 * 14
      );
      expect(body.properties.enable_recording).toBeUndefined();
      expect(body.properties.enable_transcription_storage).toBe(false);
      expect(JSON.parse(fetcher.mock.calls[1][1].body).properties).toMatchObject({
        room_name: "room-name",
        is_owner: true,
        enable_recording_ui: false,
      });
    });

    it("enables recording and transcription for scale plan team members", async () => {
      getDailyAppKeys.mockResolvedValue({ api_key: "daily-key", scale_plan: "true" });
      prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
      mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });

      await DailyVideoApiAdapter().createMeeting(event);

      const body = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(body.properties.enable_recording).toBe("cloud");
      expect(body.properties.enable_transcription_storage).toBe(true);
      expect(body.properties.permissions).toEqual({ canAdmin: ["transcription"] });
    });

    it("throws when the booking uid is missing", async () => {
      await expect(
        DailyVideoApiAdapter().createMeeting({ ...event, uid: undefined } as unknown as CalendarEvent)
      ).rejects.toThrow("We need need the booking uid to create the Daily reference in DB");
    });
  });

  describe("updateMeeting", () => {
    it("updates the existing room", async () => {
      mockEndpoints({ "/rooms/": room, "/meeting-tokens": { token: "owner-token" } });

      const result = await DailyVideoApiAdapter().updateMeeting(
        { uid: "existing-room", type: "daily_video" },
        event
      );

      expect(fetcher.mock.calls[0][0]).toBe("/rooms/existing-room");
      expect(result.id).toBe("room-name");
    });
  });

  describe("deleteMeeting", () => {
    it("deletes the room", async () => {
      mockEndpoints({ "/rooms/": {} });

      await expect(DailyVideoApiAdapter().deleteMeeting("room-name")).resolves.toBeUndefined();
      expect(fetcher).toHaveBeenCalledWith("/rooms/room-name", { method: "DELETE" });
    });
  });

  describe("getAvailability", () => {
    it("is always empty", async () => {
      await expect(DailyVideoApiAdapter().getAvailability()).resolves.toEqual([]);
    });
  });

  describe("createInstantCalVideoRoom", () => {
    it("adds a one hour buffer and starts with video off", async () => {
      mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });

      const result = await DailyVideoApiAdapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z");

      const body = JSON.parse(fetcher.mock.calls[0][1].body);
      expect(body.properties.exp).toBe(
        Math.round(new Date("2024-01-01T10:00:00.000Z").getTime() / 1000) + 3600
      );
      expect(body.properties.start_video_off).toBe(true);
      expect(body.properties.enable_recording).toBeUndefined();
      expect(result).toMatchObject({ id: "room-name", password: "owner-token" });
    });

    it("enables cloud recording on the scale plan", async () => {
      getDailyAppKeys.mockResolvedValue({ api_key: "daily-key", scale_plan: "true" });
      mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });

      await DailyVideoApiAdapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z");

      expect(JSON.parse(fetcher.mock.calls[0][1].body).properties.enable_recording).toBe("cloud");
    });
  });

  describe("getRecordings", () => {
    it("returns the parsed recordings", async () => {
      mockEndpoints({ "/recordings": { total_count: 1, data: [recordingItem] } });

      await expect(DailyVideoApiAdapter().getRecordings("room-name")).resolves.toEqual({
        total_count: 1,
        data: [recordingItem],
      });
    });

    it("throws a friendly error when the request fails", async () => {
      mockEndpoints({ "/recordings": new Error("daily down") });

      await expect(DailyVideoApiAdapter().getRecordings("room-name")).rejects.toThrow(
        "Something went wrong! Unable to get recording"
      );
    });
  });

  describe("getRecordingDownloadLink", () => {
    it("returns the download link", async () => {
      mockEndpoints({ "/recordings/": { download_link: "https://daily.co/download" } });

      await expect(DailyVideoApiAdapter().getRecordingDownloadLink("recording-1")).resolves.toEqual({
        download_link: "https://daily.co/download",
      });
    });

    it("throws a friendly error when the link cannot be fetched", async () => {
      mockEndpoints({ "/recordings/": new Error("daily down") });

      await expect(DailyVideoApiAdapter().getRecordingDownloadLink("recording-1")).rejects.toThrow(
        "Something went wrong! Unable to get recording access link"
      );
    });
  });

  describe("transcripts", () => {
    function transcriptRoutes(transcriptCount: number) {
      const data = Array.from({ length: transcriptCount }, (_, index) => ({
        transcriptId: `transcript-${index}`,
        domainId: "domain",
        roomId: "room",
        mtgSessionId: "session",
        duration: 60,
        status: "finished",
      }));
      fetcher.mockImplementation((endpoint: string) => {
        if (endpoint.startsWith("/transcript?")) {
          return Promise.resolve({ total_count: data.length, data });
        }
        const accessLinkMatch = endpoint.match(/^\/transcript\/(.+)\/access-link$/);
        if (accessLinkMatch) {
          return Promise.resolve({ link: `https://daily.co/${accessLinkMatch[1]}` });
        }
        return Promise.reject(new Error(`Unexpected endpoint ${endpoint}`));
      });
    }

    it("returns an access link per transcript, batching more than five transcripts", async () => {
      transcriptRoutes(7);

      const links = await DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name");

      expect(links).toHaveLength(7);
      expect(links[0]).toBe("https://daily.co/transcript-0");
      expect(fetcher).toHaveBeenCalledWith("/transcript?room_name=room-name");
    });

    it("returns an empty list when the room has no transcripts", async () => {
      transcriptRoutes(0);

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name")
      ).resolves.toEqual([]);
    });

    it("looks transcripts up by meeting id as well", async () => {
      transcriptRoutes(2);

      const links = await DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-1");

      expect(links).toHaveLength(2);
      expect(fetcher).toHaveBeenCalledWith("/transcript?mtgSessionId=session-1");
    });

    it("returns an empty list when the meeting has no transcripts", async () => {
      transcriptRoutes(0);

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-1")
      ).resolves.toEqual([]);
    });

    it("throws a friendly error when transcripts cannot be listed by room name", async () => {
      mockEndpoints({ "/transcript": new Error("daily down") });

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name")
      ).rejects.toThrow("Something went wrong! Unable to get transcription access link");
    });

    it("throws a friendly error when transcripts cannot be listed by meeting id", async () => {
      mockEndpoints({ "/transcript": new Error("daily down") });

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-1")
      ).rejects.toThrow("Something went wrong! Unable to get transcription access link");
    });
  });

  describe("submitBatchProcessorJob", () => {
    const body = {
      preset: "transcript" as const,
      inParams: { sourceType: "recordingId" as const, recordingId: "recording-1" },
      outParams: { s3Config: { s3KeyTemplate: "transcript" as const } },
    };

    it("returns the created job", async () => {
      mockEndpoints({ "/batch-processor": { id: "job-1" } });

      await expect(DailyVideoApiAdapter().submitBatchProcessorJob(body)).resolves.toEqual({ id: "job-1" });
    });

    it("throws a friendly error when the job cannot be submitted", async () => {
      mockEndpoints({ "/batch-processor": new Error("daily down") });

      await expect(DailyVideoApiAdapter().submitBatchProcessorJob(body)).rejects.toThrow(
        "Something went wrong! Unable to submit batch processor job"
      );
    });
  });

  describe("getTranscriptsAccessLinkFromRecordingId", () => {
    const transcription = [{ format: "json", link: "https://daily.co/transcript.json" }];

    it("returns the transcription of the finished transcript job", async () => {
      fetcher.mockImplementation((endpoint: string) => {
        if (endpoint.startsWith("/batch-processor?")) {
          return Promise.resolve({
            total_count: 2,
            data: [
              { id: "job-1", preset: "transcript", status: "running" },
              { id: "job-2", preset: "transcript", status: "finished" },
            ],
          });
        }
        return Promise.resolve({ id: "job-2", preset: "transcript", status: "finished", transcription });
      });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual(transcription);
      expect(fetcher).toHaveBeenCalledWith("/batch-processor/job-2/access-link");
    });

    it("reports when no batch processor job exists", async () => {
      mockEndpoints({ "/batch-processor": { total_count: 0, data: [] } });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual({ message: "No Batch processor jobs found for recording id recording-1" });
    });

    it("returns an empty list when no transcript job has finished", async () => {
      mockEndpoints({
        "/batch-processor": { total_count: 1, data: [{ id: "job-1", preset: "soap", status: "finished" }] },
      });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual([]);
    });

    it("throws a friendly error when the lookup fails", async () => {
      mockEndpoints({ "/batch-processor": new Error("daily down") });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).rejects.toThrow("Something went wrong! can't get transcripts");
    });
  });

  describe("checkIfRoomNameMatchesInRecording", () => {
    it("compares the room name of the recording", async () => {
      mockEndpoints({ "/recordings/": recordingItem });

      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("room-name", "recording-1")
      ).resolves.toBe(true);
      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("other-room", "recording-1")
      ).resolves.toBe(false);
    });

    it("throws when the recording cannot be fetched", async () => {
      mockEndpoints({ "/recordings/": new Error("daily down") });

      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("room-name", "recording-1")
      ).rejects.toThrow("Unable to checkIfRoomNameMatchesInRecording");
    });
  });

  describe("getMeetingInformation", () => {
    const meeting = {
      data: [
        {
          id: "session-1",
          room: "room name",
          start_time: 1_700_000_000,
          duration: 60,
          ongoing: false,
          max_participants: 2,
          participants: [
            {
              user_id: null,
              participant_id: "participant-1",
              user_name: "Attendee",
              join_time: 1_700_000_000,
              duration: 60,
            },
          ],
        },
      ],
    };

    it("url encodes the room name", async () => {
      mockEndpoints({ "/meetings": meeting });

      await expect(DailyVideoApiAdapter().getMeetingInformation("room name")).resolves.toEqual(meeting);
      expect(fetcher).toHaveBeenCalledWith("/meetings?room=room%20name");
    });

    it("throws a friendly error when the meeting cannot be fetched", async () => {
      mockEndpoints({ "/meetings": new Error("daily down") });

      await expect(DailyVideoApiAdapter().getMeetingInformation("room-name")).rejects.toThrow(
        "Something went wrong! Unable to get meeting information"
      );
    });
  });
});

describe("meeting token helpers", () => {
  const tokenInfo = { room_name: "room-name", exp: 1_700_000_000, enable_recording_ui: true, user_id: 5 };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.bookingReference.update.mockResolvedValue({});
  });

  describe("updateMeetingTokenIfExpired", () => {
    const args = { bookingReferenceId: 1, meetingToken: "token", roomName: "room-name", exp: 123 };

    it("returns null when there is no token", async () => {
      await expect(updateMeetingTokenIfExpired({ ...args, meetingToken: null })).resolves.toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("keeps a still valid token", async () => {
      mockEndpoints({ "/meeting-tokens/": tokenInfo });

      await expect(updateMeetingTokenIfExpired(args)).resolves.toBe("token");
      expect(prismaMock.bookingReference.update).not.toHaveBeenCalled();
    });

    it("issues and persists a new token when the current one is rejected", async () => {
      fetcher.mockImplementation((endpoint: string) =>
        endpoint === "/meeting-tokens"
          ? Promise.resolve({ token: "new-token" })
          : Promise.reject(new Error("expired"))
      );

      await expect(updateMeetingTokenIfExpired(args)).resolves.toBe("new-token");
      expect(prismaMock.bookingReference.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { meetingPassword: "new-token" },
      });
    });
  });

  describe("generateGuestMeetingTokenFromOwnerMeetingToken", () => {
    it("returns null without an owner token", async () => {
      await expect(
        generateGuestMeetingTokenFromOwnerMeetingToken({ meetingToken: null })
      ).resolves.toBeNull();
    });

    it("mirrors room and expiry of the owner token onto the guest token", async () => {
      fetcher.mockImplementation((endpoint: string) =>
        endpoint === "/meeting-tokens"
          ? Promise.resolve({ token: "guest-token" })
          : Promise.resolve(tokenInfo)
      );

      await expect(
        generateGuestMeetingTokenFromOwnerMeetingToken({ meetingToken: "owner-token", userId: 9 })
      ).resolves.toBe("guest-token");
      expect(JSON.parse(fetcher.mock.calls[1][1].body).properties).toEqual({
        room_name: "room-name",
        exp: tokenInfo.exp,
        enable_recording_ui: false,
        user_id: 9,
      });
    });
  });

  describe("setEnableRecordingUIAndUserIdForOrganizer", () => {
    it("returns null without a token", async () => {
      await expect(setEnableRecordingUIAndUserIdForOrganizer(1, null)).resolves.toBeNull();
    });

    it("returns null when the token is already migrated", async () => {
      mockEndpoints({ "/meeting-tokens/": { ...tokenInfo, enable_recording_ui: false, user_id: 5 } });

      await expect(setEnableRecordingUIAndUserIdForOrganizer(1, "token", 5)).resolves.toBeNull();
      expect(prismaMock.bookingReference.update).not.toHaveBeenCalled();
    });

    it("issues a new owner token and stores it on the booking reference", async () => {
      fetcher.mockImplementation((endpoint: string) =>
        endpoint === "/meeting-tokens"
          ? Promise.resolve({ token: "migrated-token" })
          : Promise.resolve(tokenInfo)
      );

      await expect(setEnableRecordingUIAndUserIdForOrganizer(1, "token", 5)).resolves.toBe("migrated-token");
      expect(prismaMock.bookingReference.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { meetingPassword: "migrated-token" },
      });
    });
  });

  describe("recording helpers", () => {
    it("returns the room name of a recording", async () => {
      mockEndpoints({ "/recordings/": recordingItem });

      await expect(getRoomNameFromRecordingId("recording-1")).resolves.toBe("room-name");
    });

    it("returns the access link of a batch processor job", async () => {
      const job = {
        id: "job-1",
        preset: "transcript",
        status: "finished",
        transcription: [{ format: "json", link: "https://daily.co/transcript.json" }],
      };
      mockEndpoints({ "/batch-processor/": job });

      await expect(getBatchProcessorJobAccessLink("job-1")).resolves.toEqual(job);
    });
  });
});

describe("environment driven configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    getDailyAppKeys.mockResolvedValue({ api_key: "daily-key", scale_plan: "true" });
    prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates rooms in the region configured through DAILY_VIDEO_REGION", async () => {
    vi.stubEnv("DAILY_VIDEO_REGION", "eu-central-1");
    mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });
    const { default: adapter } = await import("../VideoApiAdapter");

    await adapter().createMeeting(event);

    expect(JSON.parse(fetcher.mock.calls[0][1].body).properties.geo).toBe("eu-central-1");
  });

  it("rejects an unknown region", async () => {
    vi.stubEnv("DAILY_VIDEO_REGION", "mars-north-1");
    const { default: adapter } = await import("../VideoApiAdapter");

    expect(() => adapter()).toThrow("Invalid region code: mars-north-1");
  });

  it("stores recordings and transcripts in the configured S3 bucket", async () => {
    vi.stubEnv("CAL_VIDEO_BUCKET_NAME", "bucket");
    vi.stubEnv("CAL_VIDEO_BUCKET_REGION", "us-east-1");
    vi.stubEnv("CAL_VIDEO_ASSUME_ROLE_ARN", "arn:aws:iam::123456789012:role/cal-video");
    mockEndpoints({ "/rooms": room, "/meeting-tokens": { token: "owner-token" } });
    const { default: adapter } = await import("../VideoApiAdapter");

    await adapter().createMeeting(event);
    await adapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z");

    const roomProperties = JSON.parse(fetcher.mock.calls[0][1].body).properties;
    expect(roomProperties.recordings_bucket).toMatchObject({ bucket_name: "bucket", allow_api_access: true });
    expect(roomProperties.transcription_bucket).toMatchObject({ bucket_name: "bucket" });
    const instantProperties = JSON.parse(fetcher.mock.calls[2][1].body).properties;
    expect(instantProperties.recordings_bucket).toMatchObject({ bucket_region: "us-east-1" });
    expect(instantProperties.transcription_bucket).toMatchObject({
      assume_role_arn: "arn:aws:iam::123456789012:role/cal-video",
    });
  });
});
