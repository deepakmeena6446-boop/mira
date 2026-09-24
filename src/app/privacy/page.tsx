import type { Metadata } from "next";
import { getCapabilities } from "@/server/capabilities";
import { getSql } from "@/server/db/client";
import { pilotStatus } from "@/server/pilot/status";
import { formatIstDate } from "@/lib/time";

export const metadata: Metadata = { title: "About MIRA and privacy" };
export const dynamic = "force-dynamic";

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <h2 id={id ? `${id}-h` : undefined} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-ink-muted [&_strong]:text-ink [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const caps = await getCapabilities();
  let pilot = null;
  try {
    pilot = await pilotStatus(getSql());
  } catch {
    pilot = null;
  }
  return (
    <article className="flex flex-col gap-4 pb-6">
      <header>
        <h1 className="text-3xl font-bold">About MIRA</h1>
        <p className="mt-2 max-w-prose text-ink-muted">
          MIRA — <em>Know more. Move freely.</em> — is a free, privacy-first companion for moving around one pilot area: Delhi University North Campus
          around Vishwavidyalaya Metro. It shares observed conditions with their sources and limits. It does not guarantee safety, and it is not an
          emergency service.
        </p>
      </header>

      <Section id="data" title="What we keep, and for how long">
        <p>
          <strong>No account.</strong> When you first submit an observation or start a check-in, your browser gets a random, pseudonymous cookie so
          MIRA can recognise the same browser. It expires after 30 days. It has no name or profile, and it cannot be recovered on another device.
        </p>
        <p>
          <strong>Observations you share (Report).</strong> We store the type (experienced or witnessed), a broad category, a roughly 500&nbsp;m area,
          how recent it was (today, yesterday, past week, or earlier/unsure), and the time of day (day, evening, late, or unsure) — never an exact
          point or exact time. Any text you write is encrypted, checked automatically for things like phone numbers, emails, plates and addresses,
          and read only by an authorised moderator. Reports are deleted within 30 days, or sooner if rejected.
        </p>
        <p>
          <strong>Check-ins (Accompany).</strong> MIRA does not track your location. It stores only what a check-in needs: the destination (a mapped
          place or your own label, encrypted), your ETA, and the check-in state. If you invite a contact, their email is encrypted and used only for
          the invitation and, if you miss the check-in and they accepted, one alert email. All of it is deleted within 24 hours after the journey
          ends. There is no journey history.
        </p>
        <p>
          <strong>Operational records.</strong> Rate-limit counters use a daily-changing keyed hash of your IP address or browser cookie (never the
          raw IP) and expire within a day. Logs contain IDs and states — not report text, contact details, destinations or coordinates.
        </p>
      </Section>

      <Section id="community" title="How observations become community information">
        <p>
          Individual reports are never published. A moderator reviews each report for privacy and abuse (not to judge whether you are telling the
          truth) and may approve only its structured, non-identifying details for combining.
        </p>
        <p>
          Once a week, approved observations are combined by ~500&nbsp;m area, time of day (day 06:00–18:00, evening 18:00–22:00, late 22:00–06:00
          IST) and category. A summary appears in Know only when at least five independent browsers contributed recent observations to the same
          area, time of day and category — and a changed summary needs five new contributors. Summaries use fixed wording, never exact counts,
          narratives, points or times, and expire after 35 days. Reports with unsure timing stay private.
        </p>
      </Section>

      <Section id="know" title="Place and route information">
        <p>
          Place search runs on MIRA&apos;s own server against a local copy of the pilot map — your searches are not sent to a third-party geocoder.
          Walking routes are calculated from mapped walkways and are not stored. &ldquo;Use my location&rdquo; asks your browser once, only when you tap
          it; the position is sent in the request body to find the nearest walkway and then discarded.
        </p>
        <p>
          Missing map details are shown as unknown. MIRA never infers lighting, crowds, whether a business is open, or whether a place is safe.
        </p>
      </Section>

      <Section id="map-sources" title="Map sources">
        <p>
          Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).{" "}
          {pilot?.available && pilot.sourceDate ? (
            <>
              The pilot snapshot was taken on <strong>{formatIstDate(pilot.sourceDate)}</strong> and includes {pilot.placeCount} mapped places.
            </>
          ) : (
            <>The pilot map snapshot is not loaded on this server right now.</>
          )}
        </p>
        <p>
          Background map images are loaded directly from the OpenStreetMap tile servers, which see your IP address and the map area you view. If the
          map images fail to load, place and route information stays available as text.
        </p>
      </Section>

      <Section id="contacts" title="Trusted contacts">
        <p>
          A contact is invited for one journey only. They must accept before any alert can be sent. The invitation link works only for accepting —
          it never shows a live location, map or route — and it expires when the journey closes. Anyone who has the link can accept it, so share it
          only with the person you chose. You can revoke the contact at any time.
        </p>
        <p>Alert emails are attempted once and may be delayed or not delivered. MIRA does not contact emergency services.</p>
      </Section>

      <Section id="ai" title="Automated suggestions">
        {caps.ai ? (
          <p>
            If you choose to, MIRA can suggest a category for your observation using OpenAI. Before anything is sent, detected personal details are
            removed; no location, contact details or identifiers are included, and the request asks the provider not to store it. The provider may
            still keep data briefly for abuse monitoring under its own terms. Suggestions are editable and never decide what is published.
          </p>
        ) : (
          <p>MIRA does not currently send any report text to an AI provider. Reports are structured by you and reviewed by a person.</p>
        )}
      </Section>

      <Section title="What MIRA will never do">
        <ul>
          <li>Publish reports, narratives, faces, names or details about alleged perpetrators.</li>
          <li>Show live locations, public journeys, or exact report points or times.</li>
          <li>Keep movement history or offer family/partner tracking.</li>
          <li>Label places or routes &ldquo;safe&rdquo; or &ldquo;unsafe&rdquo;, score them, or predict crime.</li>
          <li>Sell data, show ads, or use trackers and analytics.</li>
        </ul>
      </Section>
    </article>
  );
}
