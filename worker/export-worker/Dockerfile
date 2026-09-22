FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY index.mjs ./index.mjs

ENV POLL_INTERVAL_MS=10000
# BACKLOT_APP_URL and BACKLOT_CRON_SECRET must be supplied at run time.
CMD ["node", "index.mjs"]
