ALTER TABLE public.episode_exports
  ADD COLUMN IF NOT EXISTS attempt_token uuid;

COMMENT ON COLUMN public.episode_exports.attempt_token IS
  'Token issued to the worker that currently owns this export attempt. Completion reports must match it.';