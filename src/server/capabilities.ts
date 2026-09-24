import "server-only";
import { aiConfigured, smtpConfigured } from "@/server/config/env";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { workerStatus } from "@/server/health/worker";
import { pilotStatus } from "@/server/pilot/status";
import { companionAvailability } from "@/domain/companion";

/**
 * Server-derived feature availability (execution plan Phase 1). The UI must render
 * a feature as live only when its capability is true.
 */
export interface Capabilities {
  database: boolean;
  map: { available: boolean; sourceDate: string | null };
  worker: { healthy: boolean };
  /** Journeys need the worker for missed-check-in processing, expiry and deletion. */
  journeys: boolean;
  /** Contact invitations/alerts need SMTP *and* a healthy worker. */
  contactEmail: boolean;
  ai: boolean;
  /** "Stay with me" companion experiment — not shipped in V0 (see companion module). */
  companion: false;
}

export async function getCapabilities(): Promise<Capabilities> {
  const sql = getSql();
  try {
    const [worker, pilot] = await Promise.all([workerStatus(sql, systemClock), pilotStatus(sql)]);
    return {
      database: true,
      map: { available: pilot.available, sourceDate: pilot.sourceDate },
      worker: { healthy: worker.healthy },
      journeys: worker.healthy,
      contactEmail: worker.healthy && smtpConfigured(),
      ai: aiConfigured(),
      companion: companionAvailability().available,
    };
  } catch {
    return {
      database: false,
      map: { available: false, sourceDate: null },
      worker: { healthy: false },
      journeys: false,
      contactEmail: false,
      ai: false,
      companion: false,
    };
  }
}
