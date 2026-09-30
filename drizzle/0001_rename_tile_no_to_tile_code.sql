-- Rename tiles.tile_no -> tiles.tile_code in place. No data is rewritten; type stays varchar(100).
-- The UNIQUE constraint (and its index) is kept and only renamed to match Drizzle's naming.
ALTER TABLE "tiles" RENAME COLUMN "tile_no" TO "tile_code";--> statement-breakpoint
ALTER TABLE "tiles" RENAME CONSTRAINT "tiles_tile_no_unique" TO "tiles_tile_code_unique";
