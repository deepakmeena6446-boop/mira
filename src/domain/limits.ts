/** Per-account limits, shared by the server (enforced) and the UI (explained up front). */
export const MAX_SAVED_PLACES = 10;
export const MAX_CONTACTS = 5;
/** Mira messages per person per day: bounds AI spend on a public URL. */
export const MIRA_DAILY_MAX = 60;
/** Model replies per network per day for guests (no account); past it, the scripted Mira answers. */
export const MIRA_GUEST_DAILY_MAX = 25;
