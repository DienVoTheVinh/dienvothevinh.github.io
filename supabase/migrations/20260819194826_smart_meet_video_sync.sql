-- Faster, observable Meet recording sync. Only metadata is stored here;
-- the video bytes remain in Google Drive.

alter table public.google_drive_connections
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_status text not null default 'idle',
  add column if not exists last_sync_error text,
  add column if not exists last_sync_mode text,
  add column if not exists last_sync_scanned integer not null default 0,
  add column if not exists last_sync_matched integer not null default 0;

alter table public.meet_recordings
  add column if not exists google_recording_name text,
  add column if not exists source text not null default 'drive_scan',
  add column if not exists recording_state text not null default 'FILE_GENERATED',
  add column if not exists conference_start_time timestamptz,
  add column if not exists conference_end_time timestamptz,
  add column if not exists is_meet_recording boolean not null default false;

-- Preserve the old metadata instead of deleting it, while hiding clearly
-- unrelated Drive videos from the Meet workflow.
update public.meet_recordings
set is_meet_recording = true
where is_meet_recording = false
  and (
    file_name ~* '[a-z]{3}-[a-z]{4}-[a-z]{3}'
    or lower(file_name) like '%recording%'
  );

create unique index if not exists meet_recordings_google_recording_name_uidx
  on public.meet_recordings(owner_user_id, google_recording_name);
create index if not exists meet_recordings_owner_meet_created_idx
  on public.meet_recordings(owner_user_id, is_meet_recording, created_time desc);
create index if not exists meet_recordings_state_idx
  on public.meet_recordings(recording_state)
  where is_meet_recording = true;

comment on column public.meet_recordings.google_recording_name is
  'Stable Google Meet API recording resource name used while Drive rendering is pending.';
comment on column public.meet_recordings.is_meet_recording is
  'True only for a recording confirmed by Meet API or strong Meet filename/schedule evidence.';
