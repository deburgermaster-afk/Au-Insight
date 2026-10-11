import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's HTTP driver: works from Vercel functions and anywhere HTTPS is allowed. On a VPS
// (Oracle) swap to drizzle-orm/node-postgres with the same schema.
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema, casing: "snake_case" });
export { schema };
