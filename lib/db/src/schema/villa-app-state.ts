import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const villaAppStateTable = pgTable("villa_app_state", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").$type<unknown | null>(),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertVillaAppStateSchema = createInsertSchema(villaAppStateTable).omit({
  updatedAt: true,
});

export type InsertVillaAppState = z.infer<typeof insertVillaAppStateSchema>;
export type VillaAppState = typeof villaAppStateTable.$inferSelect;
