# Backlot Studio export worker

Renders episode exports with FFmpeg. It runs outside the application because the
app's serverless runtime cannot execute FFmpeg.

## Contract

The worker only talks to two authenticated HTTP endpoints on the app and never
holds database, storage or AI provider credentials.

1. `POST /api/public/exports/claim`
   `Authorization: Bearer $BACKLOT_CRON_SECRET`
   Claims the oldest queued export (single-flight: `queued -> processing`).
   Returns `{ ok, job }` where `job` is `null` when nothing is queued, otherwise:

   ```jsonc
   {
     "id": "uuid",
     "width": 1080, "height": 1920, "fps": 30, "aspect": "9:16",
     "titleCard": { "enabled": true, "position": "start", "text": "...", "subtitle": "...", "durationSeconds": 3 },
     "burnSubtitles": false,
     "subtitlesSrt": null,
     "clips": [{ "url": "<signed source url>", "order": 0, "trimInSeconds": 0, "trimOutSeconds": 0, "durationSeconds": 5, "muted": false }],
     "upload": { "url": "<signed upload url>", "path": "owner/project/episode/export.mp4" }
   }
   ```

   The claim response also carries `attemptToken`, the identifier of this
   attempt.

2. `PUT <job.upload.url>` with the rendered MP4 body.

3. `POST /api/public/exports/complete`
   `{ "exportId": "uuid", "attemptToken": "uuid", "ok": true, "storagePath": "...", "fileSizeBytes": 123, "durationSeconds": 15 }`
   or `{ "exportId": "uuid", "attemptToken": "uuid", "ok": false, "error": "..." }`.
   The app rejects (HTTP 409) any report whose `attemptToken` is not the
   currently active attempt, any export that is no longer open, and any
   `storagePath` other than the one issued with the claim. It verifies the
   uploaded file exists and is non-empty before it marks the export completed,
   so a late result from an obsolete worker can never overwrite a newer one.

Exports stuck in `processing`/`uploading` for over 30 minutes are re-queued on
the next claim; after 3 attempts they are marked failed.

## Render pipeline

Each clip is trimmed, scaled and padded to the preset dimensions, forced to the
preset frame rate, re-encoded to H.264/AAC at 48 kHz stereo (a silent track is
mixed in so clips without audio still concatenate), then the segments are
concatenated with the FFmpeg concat demuxer, the optional title card is placed
at the start or end, and subtitles are burned in when requested.

Presets: `vertical_1080x1920` (9:16) and `horizontal_1920x1080` (16:9), 30 fps.

## Running

```bash
export BACKLOT_APP_URL="https://project--<project-id>.lovable.app"
export BACKLOT_CRON_SECRET="<same value as LOVABLE_CRON_SECRET in the app>"
node index.mjs          # long running poll loop
RUN_ONCE=1 node index.mjs   # process at most one export and exit
```

Docker:

```bash
docker build -t backlot-export-worker .
docker run --rm -e BACKLOT_APP_URL -e BACKLOT_CRON_SECRET backlot-export-worker
```

Any host that can run a container works (Fly.io, Railway, Render, a VM, or a
cron-scheduled `RUN_ONCE=1` container). Only outbound HTTPS is required.
