# Using your own images in Backlot

Backlot accepts PNG, JPEG and WebP images up to 10 MB. The browser and server
check the file type, size and image signature. Uploaded files stay private under
the signed-in user's storage folder.

## Microdrama characters

1. Open **Characters & sets** in a production and add or select a character.
2. Choose a reference type, optionally enter a label, and select **Upload your image**.
3. Select **Lock in** under the uploaded image to use it as the character's identity.
4. Assign that character to the required shots. New storyboards use the locked image
   as an actual image input. Character image variations also use the locked image
   when the configured image renderer supports references.

Uploaded and generated options share the same reference library. Uploading an
alternative does not automatically replace a locked identity.

## Microdrama sets and locations

1. In **Characters & sets**, open **Sets & locations** and add a named set.
2. Select **Upload set image** and optionally describe the details to preserve.
3. Choose that location in a scene or shot, and save the scene or shot.
4. New storyboards combine the selected cast references with the set image. A shot
   without its own location inherits the scene's location. An explicit shot location
   takes precedence.

The set image is selected on upload. **Replace set image** changes the reference
for future generation; it does not rewrite existing storyboard frames or clips.
The same library is also available inside **Scene breakdown**.

## Standalone image-to-video

Open **Single video** from the studio header. Enter a motion prompt and upload a
starting image. Upload an ending image as well when the video renderer supports
first-and-last-frame generation. Choose format, resolution and duration, then
select **Generate video**.

Removing the starting image also clears the ending image. Removing an image from
the form does not delete files used by submitted or historical videos. Submission
waits until uploads finish. An image upload is a starting frame in this workflow;
character/set composition uses the microdrama storyboard workflow above.

## Renderer configuration and verification

No database migration or additional bucket is needed: this change uses the existing
`character_references`, `locations`, `user_images` and private media buckets.
The production's existing database migrations and storage setup must already be
applied. A real image renderer must support reference inputs to preserve uploaded
character and set images. A missing renderer continues to produce labelled
development placeholders.

Run `npm run test:uploads` for the isolated upload/reference tests. These tests use
in-memory database/storage clients and mocked image/video responses; unexpected
network access fails. They do not use a live Supabase database or spend AI credits.
Use the production build and TypeScript checks to verify route and server bundling.
Live storage policies and provider compatibility still require a deployment test.
