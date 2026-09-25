import type { Metadata } from "next";
import { getUser } from "@/server/session/user";
import { Welcome } from "./Welcome";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getUser();
  return <Welcome signedIn={Boolean(user)} />;
}
