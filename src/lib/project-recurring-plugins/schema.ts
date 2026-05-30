import { z } from "zod";

// A recurring entry is added one of two ways: by picking a catalog plugin (an
// id) or by typing a name not yet in the catalog (which the route promotes into
// the catalog, then links). Two tiny schemas instead of one object — the route
// branches on which field the form carried.

export const pluginIdSchema = z.string().uuid("Pick a plugin from the list");

// Same "required, trimmed" rule the catalog uses for its name, so a free-text
// add and a catalog entry validate identically.
export const recurringNameSchema = z.string().trim().min(1, "Plugin name is required");

export type PluginIdInput = z.infer<typeof pluginIdSchema>;
export type RecurringNameInput = z.infer<typeof recurringNameSchema>;
