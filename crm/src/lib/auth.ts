import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  appName: "Lodgely",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  plugins: [
    organization({
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7,
      // Agency roles: owner (CEO/principal), admin, supervisor, agent, staff (reception), client.
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
