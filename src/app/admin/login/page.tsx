import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { getAdmin } from "@/server/admin/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage() {
  if (await getAdmin(getSql(), systemClock)) redirect("/admin/reports");
  return (
    <div className="mx-auto max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-1 mb-5 text-sm text-ink-muted">For MIRA moderators. There is no public account.</p>
      <LoginForm />
    </div>
  );
}
