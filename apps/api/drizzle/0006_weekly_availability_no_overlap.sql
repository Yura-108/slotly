-- Working intervals of one specialist on one weekday never overlap (FR-30).
-- Half-open [) ranges: 10:00–12:00 and 12:00–14:00 may coexist. btree_gist is enabled in 0001.
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_no_overlap" EXCLUDE USING gist ("specialist_id" WITH =, "weekday" WITH =, int4range("start_minute", "end_minute", '[)') WITH &&);
