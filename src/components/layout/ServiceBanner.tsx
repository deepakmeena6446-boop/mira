import { Notice } from "@/components/ui/Notice";
import type { Capabilities } from "@/server/capabilities";

/** Shown only when a core service is actually unavailable (UX spec §3, Home). */
export function ServiceBanner({ caps }: { caps: Capabilities }) {
  if (!caps.database) {
    return (
      <Notice tone="attention" role="status" title="MIRA is temporarily unavailable">
        We can&apos;t reach our data service right now. Please try again in a few minutes.
      </Notice>
    );
  }
  const issues: string[] = [];
  if (!caps.map.available) issues.push("Pilot map data hasn't been loaded yet, so place and route information is unavailable.");
  if (!caps.journeys) issues.push("Check-in journeys are paused because the background service that handles missed check-ins isn't running.");
  if (issues.length === 0) return null;
  return (
    <Notice tone="attention" role="status" title="Some features are unavailable">
      <ul className="list-disc pl-5">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Notice>
  );
}
