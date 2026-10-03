import { GET as contactsGET } from "@/app/api/me/contacts/route";

/** Explicit test-user choice of the eligible contacts created by this fixture. */
export async function chosenRecipientIds(): Promise<string[]> {
  const { contacts } = await (await contactsGET()).json() as { contacts: Array<{ id: string; status: string; phone: string | null }> };
  return contacts.filter((contact) => contact.status === "accepted" || contact.phone).map((contact) => contact.id);
}
