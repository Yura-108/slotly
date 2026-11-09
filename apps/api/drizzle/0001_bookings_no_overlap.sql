-- ADR-003: a specialist never has two overlapping active bookings, under any concurrency.
-- Drizzle cannot express exclusion constraints, so this migration is written by hand.

-- btree_gist lets a GiST index combine equality on uuid (specialist_id) with range overlap
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- '[)' is half-open: 10:00–11:00 and 11:00–12:00 do not overlap.
-- The predicate depends only on status (no now()): constraints must be deterministic.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "specialist_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed'));
