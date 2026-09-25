import type { Metadata } from "next";
import { getUser } from "@/server/session/user";
import { MiraChat } from "./MiraChat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mira" };

export default async function MiraPage() {
  const user = await getUser();
  return <MiraChat user={user ? { name: user.name, avatarUrl: user.avatarUrl } : null} />;
}
