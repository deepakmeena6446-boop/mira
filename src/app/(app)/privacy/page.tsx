import type { Metadata } from "next";
import Link from "next/link";
import { providerModes } from "@/server/providers/modes";
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
          </Item>
          <Item emoji="💜" title="Trips you share">
            <p>
              Each trusted contact who accepted your invite gets their own live link. They see your first name, destination, latest position and ETA until you arrive. After
              that, the link shows only that you arrived (for 30 minutes), then nothing. Remove a contact and their link stops working at once.
            </p>
            <p>&ldquo;Share link&rdquo; on the trip screen lets you send a live link to anyone you choose yourself — they can follow until you arrive.</p>
            <p>If you don&apos;t check in, MIRA emails your contacts once, and again when you arrive. It&apos;s not an emergency service: in danger, call 112 or your local emergency number.</p>
          </Item>
          <Item emoji="👤" title="Your account">
            <p>
              Your name, saved places and trusted contacts (their emails are encrypted). Delete your account in Me and all of it is erased; any reports you sent stay
              anonymous and can no longer be linked to you.
            </p>
          </Item>
          <Item emoji="✨" title="Chatting with Mira">
            <p>
              Your chat is saved to your account for 30 days so Mira can follow the conversation — without anything about where you were (area names, distances and
              nearby places are shown to you but not saved). Clear it any time in Me.
            </p>
            <p>
              {providerModes().companion === "claude"
                ? "Mira's replies are written by Anthropic's Claude. Your message, recent chat, the time, your area name, and your saved places' and trusted contacts' names are sent to generate each reply — never your coordinates. Not sold, not used for ads."
                : "Mira runs on a built-in script right now. When its AI is connected, messages will be processed by our AI provider to generate replies — never sold, never used for ads."}
            </p>
          </Item>
          <Item emoji="📝" title="Reports">
            <p>Only a rough area (about 1 km), roughly when, and the kind of thing are kept — never your exact spot. Notes are encrypted and read only by a moderator.</p>
            <p>Nothing is shown on its own. A soft note appears on the map only when at least five different people have reported something similar nearby, and disappears after five weeks. Reports are deleted within 30 days.</p>
          </Item>
          <Item emoji="🚫" title="What MIRA never does">
            <p>No ads, no selling data, no public profiles, no &ldquo;safe/unsafe&rdquo; scores or crime maps, and no tracking you didn&apos;t start.</p>
          </Item>
        </ul>
        <p className="mt-6 text-sm text-ink-subtle">
          {providerModes().maps === "google" ? "Maps, places and directions © Google." : "Map data © OpenStreetMap contributors. Basemap by OpenFreeMap."}
        </p>
      </article>
    </div>
  );
}
