import type { Metadata } from "next";
import { getSql } from "@/server/db/client";
import { getPilotInfo } from "@/server/know";
import { Notice } from "@/components/ui/Notice";
import { KnowSearch } from "./KnowSearch";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Know the area" };

export default async function KnowPage() {
  let pilot = null;
  try {
    pilot = await getPilotInfo(getSql());
  } catch {
    pilot = null;
  }
  if (!pilot?.available) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <h1 className="text-3xl font-bold">Know the area</h1>
        <Notice tone="attention" title="Map information isn't available">
          The pilot map data hasn&apos;t been loaded on this server, so place search and walking paths are unavailable. MIRA won&apos;t show generated or
          guessed map facts instead.
        </Notice>
      </div>
    );
  }
  return <KnowSearch pilot={pilot} />;
}
