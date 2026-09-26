import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contribute" };

/** CONTRIBUTE tab (Day-0 track E fills this in). */
export default async function ContributePage() {
  redirect("/report");
}
