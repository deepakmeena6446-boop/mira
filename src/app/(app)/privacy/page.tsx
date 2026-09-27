import type { Metadata } from "next";
import Link from "next/link";
import { providerModes } from "@/server/providers/modes";
import { emailConfigured, getEnv } from "@/server/config/env";
import { MiraOrb } from "@/components/app/MiraOrb";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Privacy" };

function Item({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <div className="mt-1 space-y-1.5 text-ink-muted">{children}</div>
      </div>
    </li>
  );
}

export default function PrivacyPage() {
  const canEmailContacts = emailConfigured();
  const safetyUpdates = getEnv().SAFETY_UPDATES ?? "gdelt";
  return (
    <div className="bg-companion min-h-dvh px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <article className="mx-auto max-w-xl">
        <Link href="/me" className="mb-4 inline-flex min-h-11 items-center gap-1 font-bold text-ink-muted">
          <Icon name="back" className="size-5" /> Back
        </Link>
        <div className="flex items-center gap-3">
          <MiraOrb size={52} calm />
          <h1 className="text-3xl font-extrabold">Your privacy</h1>
        </div>
        <p className="mt-3 text-lg text-ink-muted">Plain words about what MIRA keeps, who sees it, and when it&apos;s gone.</p>

        <p className="mt-2 text-sm text-ink-muted">Accounts are for adults 18 or older. MIRA keeps a signed self-attestation cookie for up to one year, without collecting a birth date. <Link href="/terms" className="font-bold text-accent underline">Read the beta terms</Link>.</p>

        <ul className="mt-6 space-y-3">
          <Item emoji="📍" title="Your location">
            <p>Used to show where you are and what&apos;s around. It isn&apos;t stored unless you&apos;re on a trip you started.</p>
            <p>During a trip, only your last few positions are kept, and they&apos;re deleted the moment the trip ends. There&apos;s no location history.</p>
            {providerModes().maps === "google" ? (
              <p>
                Search, walking directions and area names come from Google Maps Platform. MIRA&apos;s server makes these requests (not your phone), without your name or
                account, rounding your position where it can (about 100 m–1 km; routes need your starting point). The map itself loads from Google.
              </p>
            ) : (
              <p>
                To name your area and find places anywhere in the world, MIRA&apos;s server asks OpenStreetMap services (Nominatim, Photon, Overpass) using a rounded position
                (about 100 m–1 km) — never your exact spot, and never from your phone directly. The map itself loads from OpenFreeMap.
              </p>
            )}
            <p>Some third-party geocoders require rounded coordinates in a server-to-provider request URL. MIRA keeps coordinates out of your browser URL and does not log those provider URLs.</p>
          </Item>
          <Item emoji="📰" title="Safety updates">
            {safetyUpdates === "off" ? (
              <p>Safety updates are switched off in this version.</p>
            ) : (
              <>
                <p>
                  Safety updates show recent published news and official advisories about women&apos;s safety in a city: where you are on Home, or a destination you pick.
                  MIRA&apos;s server works out the city name from that point and sends only the city name to the {safetyUpdates === "fixture" ? "sample data used for testing" : "GDELT news index"} — never your
                  position, name or account. Results are cached per city for about 30 minutes, with nothing linking them to you.
                </p>
                <p>
                  {providerModes().companion === "claude"
                    ? "Headlines MIRA can't classify with its own rules are sent to Anthropic's Claude to judge relevance and translate them — the headline and publisher only, nothing about you. "
                    : ""}
                  MIRA doesn&apos;t verify news reports: each update links to its source, and none of it is a rating of any area.
                </p>
              </>
            )}
          </Item>
          <Item emoji="💜" title="Trips you share">
            <p>
              Each trusted contact on a journey (one who accepted your email invite, or one you saved with a WhatsApp number) gets their own live link. They see your first name, destination, latest position and ETA until you arrive. After
              that, the link shows only that you arrived (for 30 minutes), then nothing. Remove a contact and their link stops working at once. For WhatsApp contacts, MIRA only opens WhatsApp with the message ready: you send it, from your own WhatsApp, and MIRA never sees the chat or knows whether it was sent.
            </p>
            <p>&ldquo;Share link&rdquo; on the trip screen lets you send a live link to anyone you choose yourself — they can follow until you arrive.</p>
            <p>
              {canEmailContacts
                ? "When accepted trusted contacts are on a journey, MIRA attempts an email if you miss your check-in. Sending can fail, and MIRA records the result. People you shared a link with yourself are not emailed. Without accepted contacts, nobody is alerted."
                : "Contact email is unavailable in this version. MIRA does not email anyone if you miss a check-in. You can send your live link yourself from the trip screen."}
            </p>
            <p>
              The planned route of a journey stays on your phone (for Help Points ahead and the lighting question), not on MIRA&apos;s server, and is cleared when
              you&apos;re done.
            </p>
          </Item>
          <Item emoji="🔔" title="Notifications">
            <p>
              If you turn them on in Me, your phone&apos;s push service (Google, Apple or Mozilla) delivers MIRA&apos;s notifications to you: a missed check-in, someone
              accepting your invite, or your live location pausing. Notifications never contain your location. Turn them off in Me at any time.
            </p>
          </Item>
          <Item emoji="📞" title="If you feel unsafe">
            <p>
              &ldquo;I feel unsafe&rdquo; and Emergency work on your phone alone: nothing is sent to MIRA or anyone else until you tap an action. Emergency opens your
              phone&apos;s dialler with the emergency number for the country you&apos;re in (from a cited list; where MIRA doesn&apos;t know it, it says so before you call); MIRA doesn&apos;t call, dispatch or alert anyone for you. &ldquo;Call someone&rdquo; uses your phone&apos;s
              contacts or a number you type, and MIRA never sees or keeps it. {canEmailContacts ? "When accepted trusted contacts are available, ‘Tell my people now’ attempts to email them your live link after you tap; the screen shows whether the provider accepted each email." : "Contact email is unavailable, so ‘Tell my people now’ cannot email anyone."} &ldquo;Your location in words&rdquo; is shown on your screen only.
            </p>
            <p>Help Points are types of places where help may be available (hospitals, police, stations, pharmacies, fuel, hotels) from map data. MIRA can&apos;t confirm they&apos;re open or who&apos;s there.</p>
          </Item>
          <Item emoji="👤" title="Your account">
            <p>
              Your first name, saved places (encrypted) and trusted contacts (their emails and phone numbers are encrypted). If you sign in with Google, MIRA keeps your Google account
              id, your first name and a protected (encrypted) copy of your email — nothing else from Google: no photo, no contacts, no location history. If you add your
              email to keep your account, it&apos;s stored encrypted and only used for sign-in links. Delete your account in Me and all of it is erased; any reports you sent stay anonymous and can no longer be linked
              to you. An account with an email that isn&apos;t used for over a year is deleted; one without an email goes when you sign out or its session ends.
            </p>
          </Item>
          <Item emoji="🧭" title="What MIRA remembers about how you travel">
            <p>
              Only what you chose: your preferred way of travelling, and — after a journey to one of <em>your saved places</em> that you finished — a counter of how
              often you go there, by which way, at about which hour, and who you shared it with last time. No routes, no coordinates, no times finer than the hour.
              It&apos;s used only to suggest &ldquo;like usual&rdquo; when you&apos;ve done the same thing at least three times. See it, switch it off or delete it
              in Me &rarr; What MIRA remembers. MIRA never records where you go in the background.
            </p>
          </Item>
          <Item emoji="✨" title="Chatting with Mira">
            <p>
              Your chat is saved to your account for 30 days so Mira can follow the conversation. Mira&apos;s replies are saved without area names, walking times or
              nearby places. <strong className="text-ink">Your own messages are saved exactly as you typed them</strong>, so don&apos;t type addresses you&apos;d rather not
              keep. Clear it any time in Me.
            </p>
            <p>
              {providerModes().companion === "claude"
                ? "Mira's replies are written by Anthropic's Claude. Your message, recent chat, the time, your area name, and your saved places' and trusted contacts' names are sent to generate each reply — never your coordinates. Not sold, not used for ads."
                : "Mira runs on a built-in script right now. When its AI is connected, messages will be processed by our AI provider to generate replies — never sold, never used for ads."}
            </p>
          </Item>
          <Item emoji="📝" title="Reports">
            <p>Only a rough area (about 1 km), roughly when, and the kind of thing are kept — never your exact spot. Notes are encrypted and read only by a moderator.</p>
            <p>
              Reports are submitted privately. They may be reviewed before they can contribute to MIRA&apos;s information, and public notes are currently switched
              off: nothing from reports is shown to anyone during this beta. When switched on, a fixed-wording note appears on a route that passes through the area only when at least five different people have reported something similar nearby, and disappears after five weeks. Reports are deleted within 30 days. How reports are reviewed is in MIRA&apos;s moderation policy (MODERATION_POLICY.md in the project).
            </p>
          </Item>
          <Item emoji="💡" title="Street lighting">
            <p>
              After a walk in the dark, you can tell MIRA whether the way was lit. Your answer is saved per short street stretch (about 40 m), with only the day — not
              your name, your account, your trip, or a time — and nothing links one stretch to the next, so it can&apos;t be joined back into your route.
            </p>
            <p>A stretch shows as lit or dark only once at least three different people agree. Answers older than 90 days stop counting and are deleted after 120.</p>
          </Item>
          <Item emoji="🤝" title="Contributions and your impact">
            <p>
              Answers to MIRA Checks (&ldquo;Was this pharmacy open?&rdquo;) and corrections are stored like lighting answers: per place, with the day, and a keyed
              code instead of your name, so they can&apos;t be joined into where you went. So MIRA can tell you when someone else confirms your answer, your account
              keeps a private, encrypted note of it until it&apos;s confirmed or expires (30 days for places, 90 for lighting) — then only the outcome stays
              (&ldquo;verified&rdquo;, with the day and country). Your current impact counts only verifiable, verified answers. Older credited place answers without a recomputation link are retained until normal deletion but excluded from current impact and Local Steward; there are no points, rankings or public profiles, and
              reports never count towards anything.
            </p>
          </Item>
          <Item emoji="🚫" title="What MIRA never does">
            <p>No ads, no selling data, no analytics trackers, no public profiles, no &ldquo;safe/unsafe&rdquo; scores or crime maps, and no tracking you didn&apos;t start.</p>
          </Item>
        </ul>
        <p className="mt-6 text-sm text-ink-subtle">
          {providerModes().maps === "google" ? "Maps, places and directions © Google." : "Map data © OpenStreetMap contributors. Basemap by OpenFreeMap."}
        </p>
      </article>
    </div>
  );
}
