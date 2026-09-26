import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getUser } from "@/server/session/user";
import { getGeo } from "@/server/providers/geo";
import { impactFor, listChecks, prepareChecks } from "@/server/contributions";
import { ContributeScreen } from "./ContributeScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribute" };

/** CONTRIBUTE tab: MIRA Checks, corrections, private reports, and honest (verified-only) impact. */
export default async function ContributePage() {
  const sql = getSql();
  const user = await getUser(sql);
  if (!user) return <ContributeScreen signedIn={false} durable={false} checks={[]} impact={null} />;
  const now = new Date();
  // A walk that just ended may still be "preparing": finish hers now (bounded) rather than wait for the worker.
  await prepareChecks(sql, getGeo(), now, { userId: user.id, limit: 2 }).catch(() => undefined);
  const [checks, impact] = await Promise.all([listChecks(sql, user.id, now), impactFor(sql, user, now)]);
  return <ContributeScreen signedIn durable={user.durable} checks={checks} impact={impact} />;
}
