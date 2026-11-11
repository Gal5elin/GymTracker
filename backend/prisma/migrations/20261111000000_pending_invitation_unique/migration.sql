-- Keep historical rejected/revoked links while enforcing one pending invitation per pair.
CREATE UNIQUE INDEX "trainer_links_pending_pair_key"
ON "trainer_links" ("trainer_id", "member_id") WHERE "status" = 'PENDING';
