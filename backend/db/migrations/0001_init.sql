-- Initial schema for the Monkeytype backend on Postgres.
--
-- Nested, schema-free structures (personal bests, the typing streak, profile
-- details, ...) are stored as jsonb so they keep the shape the API already
-- returns. Everything that is filtered or sorted on gets its own column.

create extension if not exists "pgcrypto";

create table users (
  uid                   text primary key,
  name                  text        not null,
  email                 text        not null default '',
  added_at              bigint      not null,

  completed_tests       integer     not null default 0,
  started_tests         integer     not null default 0,
  time_typing           double precision not null default 0,
  xp                    bigint      not null default 0,
  bananas               integer     not null default 0,

  personal_bests        jsonb       not null default '{"time":{},"words":{},"quote":{},"zen":{},"custom":{}}',
  streak                jsonb,
  profile_details       jsonb,
  custom_themes         jsonb       not null default '[]',
  result_filter_presets jsonb       not null default '[]',
  favorite_quotes       jsonb       not null default '{}',
  inventory             jsonb,
  premium               jsonb,
  -- { "<year>": [tests per day of year] }
  test_activity         jsonb       not null default '{}',

  banned                boolean     not null default false,
  verified              boolean,
  needs_to_change_name  boolean     not null default false,
  suspicious            boolean     not null default false,
  note                  text,

  ips                   text[]      not null default '{}',
  name_history          text[]      not null default '{}',
  last_name_change      bigint,
  auto_ban_timestamps   bigint[]    not null default '{}',
  last_result_hashes    text[]      not null default '{}'
);

-- names are compared case insensitively when checking availability
create unique index users_name_lower_key on users (lower(name));

create table tags (
  id             uuid  primary key default gen_random_uuid(),
  uid            text  not null references users (uid) on delete cascade,
  name           text  not null,
  personal_bests jsonb not null default '{"time":{},"words":{},"quote":{},"zen":{},"custom":{}}'
);

create index tags_uid_idx on tags (uid);

create table results (
  id                      uuid primary key default gen_random_uuid(),
  uid                     text   not null references users (uid) on delete cascade,
  timestamp               bigint not null,

  wpm                     double precision not null,
  raw_wpm                 double precision not null,
  acc                     double precision not null,
  consistency             double precision not null,
  key_consistency         double precision not null,
  char_stats              integer[] not null,

  mode                    text   not null,
  mode2                   text   not null,
  test_duration           double precision not null,

  quote_length            integer,
  restart_count           integer,
  incomplete_test_seconds double precision,
  afk_duration            double precision,
  tags                    text[],
  bailed_out              boolean,
  blind_mode              boolean,
  lazy_mode               boolean,
  funbox                  text[],
  language                text,
  difficulty              text,
  numbers                 boolean,
  punctuation             boolean,
  is_pb                   boolean,
  name                    text,

  chart_data              jsonb,
  key_spacing_stats       jsonb,
  key_duration_stats      jsonb
);

create index results_uid_timestamp_idx on results (uid, timestamp desc);

create table configs (
  uid    text  primary key references users (uid) on delete cascade,
  config jsonb not null default '{}'
);

create table presets (
  id             uuid  primary key default gen_random_uuid(),
  uid            text  not null references users (uid) on delete cascade,
  name           text  not null,
  config         jsonb not null default '{}',
  setting_groups text[]
);

create index presets_uid_idx on presets (uid);

-- single row holding the live server configuration
create table configuration (
  id    boolean primary key default true check (id),
  value jsonb   not null
);
