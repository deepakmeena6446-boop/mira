import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { getGeo } from "@/server/providers/geo";
import { impactFor, listChecks, prepareChecks } from "@/server/contributions";
import { ContributeScreen } from "./ContributeScreen";
import { smtpConfigured } from "@/server/config/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribute" };

/** CONTRIBUTE tab: Mira Checks, corrections, private reports, and honest (verified-only) impact. */
export default async function ContributePage() {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) return <ContributeScreen signedIn={false} durable={false} checks={[]} impact={null} pendingChecks={false} emailAlerts={smtpConfigured()} />;
  const now = new Date();
  // A walk that just ended may still be "preparing": finish hers now (bounded) rather than wait for the worker.
  await prepareChecks(sql, getGeo(), now, { userId: user.id, limit: 2 }).catch(() => undefined);
  const [checks, impact, pending] = await Promise.all([listChecks(sql, user.id, now), impactFor(sql, user, now), sql`SELECT 1 FROM mira_checks WHERE user_id = ${user.id} AND state = 'preparing' AND expires_at > ${now} LIMIT 1`]);
  return <ContributeScreen signedIn durable={user.durable} checks={checks} impact={impact} pendingChecks={pending.length > 0} emailAlerts={smtpConfigured()} />;
}
