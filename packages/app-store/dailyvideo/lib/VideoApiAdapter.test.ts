import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetcher, getDailyAppKeys } = vi.hoisted(() => ({
  fetcher: vi.fn(),
  getDailyAppKeys: vi.fn(),
}));

vi.mock("./dailyApiFetcher", () => ({ fetcher }));
vi.mock("@calcom/app-store/dailyvideo/lib/getDailyAppKeys", () => ({ getDailyAppKeys }));

import type { CalendarEvent } from "@calcom/types/Calendar";
import DailyVideoApiAdapter, {
  generateGuestMeetingTokenFromOwnerMeetingToken,
  getBatchProcessorJobAccessLink,
  getRoomNameFromRecordingId,
  setEnableRecordingUIAndUserIdForOrganizer,
  updateMeetingTokenIfExpired,
} from "./VideoApiAdapter";

const room = {
  id: "room-id",
  name: "room-name",
  api_created: true,
  privacy: "public",
  url: "https://cal.daily.co/room-name",
  created_at: "2024-01-01T00:00:00.000Z",
  config: {
    exp: 1735689600,
    enable_chat: true,
    enable_knocking: true,
    enable_prejoin_ui: true,
    enable_pip_ui: true,
    enable_transcription_storage: false,
  },
};

const recording = {
  id: "recording-1",
  room_name: "room-name",
  start_ts: 1735689600,
  status: "finished",
  duration: 60,
  share_token: "share-token",
};

const event = {
  uid: "booking-uid",
  endTime: "2024-01-01T10:00:00.000Z",
  organizer: { id: 1, email: "organizer@example.com", name: "Organizer", timeZone: "UTC", language: {} },
} as unknown as CalendarEvent;

/** Resolves the room creation call and the meeting token call that follows it. */
const mockRoomCreation = () => {
  fetcher.mockResolvedValueOnce(room).mockResolvedValueOnce({ token: "meeting-token" });
};

const bodyOf = (callIndex: number) => JSON.parse(fetcher.mock.calls[callIndex][1].body);

describe("DailyVideoApiAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "false" });
    prismaMock.membership.findFirst.mockResolvedValue(null);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("createMeeting", () => {
    it("creates a room expiring 14 days after the booking and an owner meeting token", async () => {
      mockRoomCreation();

      await expect(DailyVideoApiAdapter().createMeeting(event)).resolves.toEqual({
        type: "daily_video",
        id: "room-name",
        password: "meeting-token",
        url: "https://cal.daily.co/room-name",
      });

      expect(fetcher.mock.calls[0][0]).toBe("/rooms");
      const roomBody = bodyOf(0);
      expect(roomBody.privacy).toBe("public");
      expect(roomBody.properties.exp).toBe(
        Math.round(new Date(event.endTime).getTime() / 1000) + 60 * 60 * 24 * 14
      );
      expect(roomBody.properties.enable_recording).toBeUndefined();
      expect(roomBody.properties.enable_transcription_storage).toBe(false);
      expect(bodyOf(1).properties).toMatchObject({
        room_name: "room-name",
        exp: room.config.exp,
        is_owner: true,
        enable_recording_ui: false,
      });
    });

    it("enables recording and transcription for team members on a scale plan", async () => {
      getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "true" });
      prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
      mockRoomCreation();

      await DailyVideoApiAdapter().createMeeting(event);

      const roomBody = bodyOf(0);
      expect(roomBody.properties.enable_recording).toBe("cloud");
      expect(roomBody.properties.enable_transcription_storage).toBe(true);
      expect(roomBody.properties.permissions).toEqual({ canAdmin: ["transcription"] });
    });

    it("requires a booking uid", async () => {
      await expect(
        DailyVideoApiAdapter().createMeeting({ ...event, uid: undefined } as unknown as CalendarEvent)
      ).rejects.toThrow("We need need the booking uid to create the Daily reference in DB");
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe("DAILY_VIDEO_REGION", () => {
    /** The region is read at module scope, so the adapter has to be re-imported per case. */
    const importAdapterWithRegion = async (region?: string) => {
      vi.resetModules();
      vi.stubEnv("DAILY_VIDEO_REGION", region ?? "");
      if (!region) vi.unstubAllEnvs();
      const module = await import("./VideoApiAdapter");
      return module.default;
    };

    it("pins created rooms to the configured region", async () => {
      const adapter = await importAdapterWithRegion("eu-central-1");
      mockRoomCreation();

      await adapter().createMeeting(event);

      expect(bodyOf(0).properties.geo).toBe("eu-central-1");
    });

    it("lets daily choose the region when none is configured", async () => {
      const adapter = await importAdapterWithRegion();
      mockRoomCreation();

      await adapter().createMeeting(event);

      expect(bodyOf(0).properties.geo).toBeUndefined();
    });

    it("refuses an unknown region code", async () => {
      vi.resetModules();
      vi.stubEnv("DAILY_VIDEO_REGION", "mars-north-1");
      const { default: adapter } = await import("./VideoApiAdapter");

      expect(() => adapter()).toThrow("Invalid region code: mars-north-1");
      vi.unstubAllEnvs();
    });
  });

  describe("with S3 storage configured", () => {
    const bucket = {
      bucket_name: "cal-video",
      bucket_region: "us-east-1",
      assume_role_arn: "arn:aws:iam::1:role/cal",
    };

    /** S3 support is resolved at module scope, so the adapter has to be re-imported. */
    const importAdapterWithS3 = async () => {
      vi.resetModules();
      vi.stubEnv("CAL_VIDEO_BUCKET_NAME", bucket.bucket_name);
      vi.stubEnv("CAL_VIDEO_BUCKET_REGION", bucket.bucket_region);
      vi.stubEnv("CAL_VIDEO_ASSUME_ROLE_ARN", bucket.assume_role_arn);
      const module = await import("./VideoApiAdapter");
      return module.default;
    };

    beforeEach(() => {
      getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "true" });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("stores booking recordings and transcripts in the bucket", async () => {
      const adapter = await importAdapterWithS3();
      prismaMock.membership.findFirst.mockResolvedValue({ id: 1 });
      mockRoomCreation();

      await adapter().createMeeting(event);

      const properties = bodyOf(0).properties;
      expect(properties.recordings_bucket).toEqual({
        ...bucket,
        allow_api_access: true,
        allow_streaming_from_bucket: false,
      });
      expect(properties.transcription_bucket).toEqual({ ...bucket, allow_api_access: true });
    });

    it("stores instant meeting recordings and transcripts in the bucket", async () => {
      const adapter = await importAdapterWithS3();
      mockRoomCreation();

      await adapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z");

      const properties = bodyOf(0).properties;
      expect(properties.recordings_bucket).toMatchObject(bucket);
      expect(properties.transcription_bucket).toMatchObject(bucket);
      expect(properties.permissions).toEqual({ canAdmin: ["transcription"] });
    });
  });

  describe("updateMeeting", () => {
    it("posts to the room of the existing booking reference", async () => {
      mockRoomCreation();

      await DailyVideoApiAdapter().updateMeeting({ uid: "existing-room" }, event);

      expect(fetcher.mock.calls[0][0]).toBe("/rooms/existing-room");
    });
  });

  describe("deleteMeeting", () => {
    it("deletes the room", async () => {
      fetcher.mockResolvedValueOnce({});

      await expect(DailyVideoApiAdapter().deleteMeeting("room-name")).resolves.toBeUndefined();

      expect(fetcher).toHaveBeenCalledWith("/rooms/room-name", { method: "DELETE" });
    });
  });

  describe("getAvailability", () => {
    it("is always empty because daily has no busy times", async () => {
      await expect(DailyVideoApiAdapter().getAvailability()).resolves.toEqual([]);
    });
  });

  describe("createInstantCalVideoRoom", () => {
    it("creates a room expiring one hour after the end time with video off", async () => {
      mockRoomCreation();

      await expect(
        DailyVideoApiAdapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z")
      ).resolves.toMatchObject({ id: "room-name", password: "meeting-token" });

      const roomBody = bodyOf(0);
      expect(roomBody.properties.exp).toBe(
        Math.round(new Date("2024-01-01T10:00:00.000Z").getTime() / 1000) + 60 * 60
      );
      expect(roomBody.properties.start_video_off).toBe(true);
      expect(roomBody.properties.enable_recording).toBeUndefined();
    });

    it("enables recording on a scale plan regardless of team membership", async () => {
      getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "true" });
      mockRoomCreation();

      await DailyVideoApiAdapter().createInstantCalVideoRoom("2024-01-01T10:00:00.000Z");

      expect(bodyOf(0).properties.enable_recording).toBe("cloud");
    });
  });

  describe("getRecordings", () => {
    it("returns the parsed recordings of a room", async () => {
      fetcher.mockResolvedValueOnce({ total_count: 1, data: [recording] });

      await expect(DailyVideoApiAdapter().getRecordings("room-name")).resolves.toEqual({
        total_count: 1,
        data: [recording],
      });
      expect(fetcher).toHaveBeenCalledWith("/recordings?room_name=room-name");
    });

    it("throws when the recordings cannot be fetched", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(DailyVideoApiAdapter().getRecordings("room-name")).rejects.toThrow(
        "Something went wrong! Unable to get recording"
      );
    });
  });

  describe("getRecordingDownloadLink", () => {
    it("requests a link valid for 12 hours", async () => {
      fetcher.mockResolvedValueOnce({ download_link: "https://cal.daily.co/download" });

      await expect(DailyVideoApiAdapter().getRecordingDownloadLink("recording-1")).resolves.toEqual({
        download_link: "https://cal.daily.co/download",
      });
      expect(fetcher).toHaveBeenCalledWith("/recordings/recording-1/access-link?valid_for_secs=43200");
    });

    it("throws when the link is missing", async () => {
      fetcher.mockResolvedValueOnce({});

      await expect(DailyVideoApiAdapter().getRecordingDownloadLink("recording-1")).rejects.toThrow(
        "Something went wrong! Unable to get recording access link"
      );
    });
  });

  describe("transcript access links", () => {
    const transcript = (transcriptId: string) => ({
      transcriptId,
      domainId: "domain",
      roomId: "room",
      mtgSessionId: "session",
      duration: 10,
      status: "finished",
    });

    it("resolves an access link for every transcript of a room", async () => {
      fetcher.mockResolvedValueOnce({ total_count: 2, data: [transcript("t1"), transcript("t2")] });
      fetcher.mockResolvedValue({ link: "https://cal.daily.co/transcript" });

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name")
      ).resolves.toEqual(["https://cal.daily.co/transcript", "https://cal.daily.co/transcript"]);
      expect(fetcher).toHaveBeenCalledWith("/transcript/t1/access-link");
    });

    it("batches transcript link requests in groups of five", async () => {
      const transcripts = Array.from({ length: 6 }, (_, index) => transcript(`t${index}`));
      fetcher.mockResolvedValueOnce({ total_count: 6, data: transcripts });
      fetcher.mockResolvedValue({ link: "https://cal.daily.co/transcript" });

      const links = await DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-id");

      expect(links).toHaveLength(6);
      expect(fetcher.mock.calls[0][0]).toBe("/transcript?mtgSessionId=session-id");
    });

    it("returns nothing when the room has no transcripts", async () => {
      fetcher.mockResolvedValueOnce({ total_count: 0, data: [] });

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name")
      ).resolves.toEqual([]);
    });

    it("returns nothing when the meeting has no transcripts", async () => {
      fetcher.mockResolvedValueOnce({ total_count: 0, data: [] });

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-id")
      ).resolves.toEqual([]);
    });

    it("throws when the transcript listing fails", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromRoomName("room-name")
      ).rejects.toThrow("Something went wrong! Unable to get transcription access link");
    });

    it("throws when the meeting transcript listing fails", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(
        DailyVideoApiAdapter().getAllTranscriptsAccessLinkFromMeetingId("session-id")
      ).rejects.toThrow("Something went wrong! Unable to get transcription access link");
    });
  });

  describe("submitBatchProcessorJob", () => {
    const body = {
      preset: "transcript",
      inParams: { sourceType: "recordingId", recordingId: "recording-1" },
      outParams: { s3Config: { s3KeyTemplate: "transcript" } },
    } as const;

    it("posts the job and returns its id", async () => {
      fetcher.mockResolvedValueOnce({ id: "job-1" });

      await expect(DailyVideoApiAdapter().submitBatchProcessorJob(body)).resolves.toEqual({ id: "job-1" });
      expect(fetcher.mock.calls[0][0]).toBe("/batch-processor");
      expect(bodyOf(0)).toEqual(body);
    });

    it("throws when the job cannot be submitted", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(DailyVideoApiAdapter().submitBatchProcessorJob(body)).rejects.toThrow(
        "Something went wrong! Unable to submit batch processor job"
      );
    });
  });

  describe("getTranscriptsAccessLinkFromRecordingId", () => {
    const transcription = [{ format: "json", link: "https://cal.daily.co/transcript.json" }];

    it("returns the transcription of the finished transcript job", async () => {
      fetcher
        .mockResolvedValueOnce({
          total_count: 2,
          data: [
            { id: "job-0", preset: "transcript", status: "running" },
            { id: "job-1", preset: "transcript", status: "finished" },
          ],
        })
        .mockResolvedValueOnce({ id: "job-1", preset: "transcript", status: "finished", transcription });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual(transcription);
    });

    it("reports when the recording has no batch processor jobs", async () => {
      fetcher.mockResolvedValueOnce({ total_count: 0, data: [] });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual({ message: "No Batch processor jobs found for recording id recording-1" });
    });

    it("returns nothing while no transcript job has finished", async () => {
      fetcher.mockResolvedValueOnce({
        total_count: 1,
        data: [{ id: "job-1", preset: "transcript", status: "running" }],
      });

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).resolves.toEqual([]);
    });

    it("throws when the lookup fails", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(
        DailyVideoApiAdapter().getTranscriptsAccessLinkFromRecordingId("recording-1")
      ).rejects.toThrow("Something went wrong! can't get transcripts");
    });
  });

  describe("checkIfRoomNameMatchesInRecording", () => {
    it("compares the room name of the recording", async () => {
      fetcher.mockResolvedValue(recording);

      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("room-name", "recording-1")
      ).resolves.toBe(true);
      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("other-room", "recording-1")
      ).resolves.toBe(false);
    });

    it("throws when the recording cannot be fetched", async () => {
      fetcher.mockRejectedValueOnce(new Error("boom"));

      await expect(
        DailyVideoApiAdapter().checkIfRoomNameMatchesInRecording("room-name", "recording-1")
      ).rejects.toThrow("Something went wrong! Unable to checkIfRoomNameMatchesInRecording");
    });
  });

  describe("getMeetingInformation", () => {
    it("url encodes the room name", async () => {
      fetcher.mockResolvedValueOnce({ data: [] });

      await expect(DailyVideoApiAdapter().getMeetingInformation("room name")).resolves.toEqual({ data: [] });
      expect(fetcher).toHaveBeenCalledWith("/meetings?room=room%20name");
    });

    it("throws when the response does not match the schema", async () => {
      fetcher.mockResolvedValueOnce({});

      await expect(DailyVideoApiAdapter().getMeetingInformation("room-name")).rejects.toThrow(
        "Something went wrong! Unable to get meeting information"
      );
    });
  });
});

describe("meeting token helpers", () => {
  const token = { room_name: "room-name", exp: 1735689600, enable_recording_ui: true, user_id: 7 };

  beforeEach(() => {
    vi.clearAllMocks();
    getDailyAppKeys.mockResolvedValue({ api_key: "api-key", scale_plan: "false" });
  });

  describe("updateMeetingTokenIfExpired", () => {
    const args = { bookingReferenceId: 3, meetingToken: "token", roomName: "room-name", exp: 1735689600 };

    it("keeps a token that daily still accepts", async () => {
      fetcher.mockResolvedValueOnce(token);

      await expect(updateMeetingTokenIfExpired(args)).resolves.toBe("token");
      expect(prismaMock.bookingReference.update).not.toHaveBeenCalled();
    });

    it("issues and stores a new owner token once the old one expired", async () => {
      fetcher.mockRejectedValueOnce(new Error("expired")).mockResolvedValueOnce({ token: "new-token" });

      await expect(updateMeetingTokenIfExpired(args)).resolves.toBe("new-token");

      expect(bodyOf(1).properties).toEqual({
        room_name: "room-name",
        exp: args.exp,
        enable_recording_ui: false,
        is_owner: true,
      });
      expect(prismaMock.bookingReference.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { meetingPassword: "new-token" },
      });
    });

    it("does nothing without a token", async () => {
      await expect(updateMeetingTokenIfExpired({ ...args, meetingToken: null })).resolves.toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe("generateGuestMeetingTokenFromOwnerMeetingToken", () => {
    it("derives a guest token for the same room and expiry", async () => {
      fetcher.mockResolvedValueOnce(token).mockResolvedValueOnce({ token: "guest-token" });

      await expect(
        generateGuestMeetingTokenFromOwnerMeetingToken({ meetingToken: "token", userId: 9 })
      ).resolves.toBe("guest-token");

      expect(bodyOf(1).properties).toEqual({
        room_name: "room-name",
        exp: token.exp,
        enable_recording_ui: false,
        user_id: 9,
      });
    });

    it("does nothing without a token", async () => {
      await expect(
        generateGuestMeetingTokenFromOwnerMeetingToken({ meetingToken: null })
      ).resolves.toBeNull();
    });
  });

  describe("setEnableRecordingUIAndUserIdForOrganizer", () => {
    it("rewrites tokens that still have the recording ui enabled", async () => {
      fetcher.mockResolvedValueOnce(token).mockResolvedValueOnce({ token: "new-token" });

      await expect(setEnableRecordingUIAndUserIdForOrganizer(3, "token", 9)).resolves.toBe("new-token");

      expect(bodyOf(1).properties).toEqual({
        room_name: "room-name",
        exp: token.exp,
        enable_recording_ui: false,
        is_owner: true,
        user_id: 9,
      });
      expect(prismaMock.bookingReference.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { meetingPassword: "new-token" },
      });
    });

    it("leaves already migrated tokens untouched", async () => {
      fetcher.mockResolvedValueOnce({ ...token, enable_recording_ui: false });

      await expect(setEnableRecordingUIAndUserIdForOrganizer(3, "token", 9)).resolves.toBeNull();
      expect(prismaMock.bookingReference.update).not.toHaveBeenCalled();
    });

    it("does nothing without a token", async () => {
      await expect(setEnableRecordingUIAndUserIdForOrganizer(3, null)).resolves.toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe("getRoomNameFromRecordingId", () => {
    it("reads the room name of a recording", async () => {
      fetcher.mockResolvedValueOnce(recording);

      await expect(getRoomNameFromRecordingId("recording-1")).resolves.toBe("room-name");
    });
  });

  describe("getBatchProcessorJobAccessLink", () => {
    it("parses the transcript access link response", async () => {
      const transcription = [{ format: "json", link: "https://cal.daily.co/transcript.json" }];
      fetcher.mockResolvedValueOnce({ id: "job-1", preset: "transcript", status: "finished", transcription });

      await expect(getBatchProcessorJobAccessLink("job-1")).resolves.toEqual({
        id: "job-1",
        preset: "transcript",
        status: "finished",
        transcription,
      });
    });
  });
});
