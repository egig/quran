-- Ayahs a signed-in reader has bookmarked. `page` is the mushaf page the
-- ayah was bookmarked on (its first word's page), for linking back.
create table "bookmark" (
  "userId" text not null references "user" ("id") on delete cascade,
  "surah" integer not null,
  "ayah" integer not null,
  "page" integer not null,
  "createdAt" integer not null,
  primary key ("userId", "surah", "ayah")
);

create index "bookmark_user_created_idx" on "bookmark" ("userId", "createdAt");
