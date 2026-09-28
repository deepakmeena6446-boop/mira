import { cookies } from "next/headers";
import { getSql } from "@/server/db/client";
import { systemClock } from "@/server/clock";
import { viewInvite } from "@/server/journey/invites";
import { contactInviteView } from "@/server/account/contacts";
import { Avatar } from "@/components/app/Avatar";
import { inviteCookieName } from "@/server/journey/invite-cookie";
import { formatPlaceDateTime } from "@/lib/time";
import { AcceptButton } from "./AcceptButton";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const token = (await cookies()).get(inviteCookieName())?.value ?? "";
  const contact = await contactInviteView(getSql(), token);
  if (contact) {
    return (
      <section aria-labelledby="inv-h" className="animate-rise rounded-[var(--radius-card)] bg-surface p-7 shadow-[var(--shadow-card)]">
        <Avatar name={contact.owner} size={64} />
        <h1 id="inv-h" className="mt-4 text-2xl font-semibold">
          {contact.owner} wants you as a trusted contact
        </h1>
        <ul className="mt-4 space-y-2 text-ink-muted">
          <li>• When {contact.owner} shares a trip, you get a link to follow along live until they arrive.</li>
          <li>• If they don&apos;t check in on time, Mira lets you know.</li>
          <li>• You only see their location during a trip they choose to share. Never otherwise.</li>
        </ul>
        <div className="mt-6">
          {contact.accepted_at ? (
            <p className="rounded-[var(--radius-control)] bg-mint-soft px-4 py-3 font-semibold text-mint">You&apos;re already one of {contact.owner}&apos;s trusted contacts.</p>
          ) : (
            <AcceptButton />
          )}
        </div>
      </section>
    );
  }
  const invite = await viewInvite(getSql(), token, systemClock.now());

  if (invite.status !== "valid" && invite.status !== "accepted") {
    const copy = {
      invalid: "This invitation link isn't valid. It may have been mistyped or opened after too long. Try the link from the email again.",
      expired: "This invitation has expired because the journey has ended. There's nothing you need to do.",
      revoked: "The person who invited you has withdrawn this invitation. There's nothing you need to do.",
    }[invite.status];
    return (
      <section aria-labelledby="inv-h" className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <h1 id="inv-h" className="text-2xl font-bold">
          Invitation not available
        </h1>
        <p className="mt-2 text-ink-muted">{copy}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="inv-h" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h1 id="inv-h" className="text-2xl font-bold">
        Be a check-in contact for one journey
      </h1>
      <p className="text-ink-muted">Someone asked Mira to email you if they don&apos;t check in after a planned trip.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[var(--radius-control)] bg-sunken p-4">
        <dt className="text-ink-muted">Planned arrival</dt>
        <dd className="font-medium">{formatPlaceDateTime(invite.etaAt!, invite.tz ?? null)}</dd>
        <dt className="text-ink-muted">Destination</dt>
        <dd className="font-medium">{invite.placeName ?? "Planned destination"}</dd>
        <dt className="text-ink-muted">Invitation ends</dt>
        <dd className="font-medium">When the journey ends — at the latest {formatPlaceDateTime(invite.expiresAt!, invite.tz ?? null)}</dd>
      </dl>
      <div>
        <h2 className="font-semibold">What accepting means</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted">
          <li>If they miss the check-in by 10 minutes, Mira tries to send you one email. Delivery isn&apos;t guaranteed.</li>
          <li>Mira never shows you a live location, map or route, and it isn&apos;t an emergency service.</li>
          <li>You won&apos;t get anything else, and the invitation ends with this journey. They can withdraw it at any time.</li>
          <li>Anyone with the email link can accept it, so don&apos;t forward the link.</li>
        </ul>
      </div>
      {invite.status === "accepted" ? (
        <p className="rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 font-medium">You&apos;ve already accepted this invitation.</p>
      ) : (
        <AcceptButton />
      )}
    </section>
  );
}
