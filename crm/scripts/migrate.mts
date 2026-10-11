// Applies drizzle/*.sql over Neon's HTTP driver (works where raw Postgres TCP is blocked).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const db = drizzle(neon(process.env.DATABASE_URL!));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations applied");
