/** Friendly emoji for a place kind label (from map data). */
export function kindEmoji(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("metro") || k.includes("station")) return "🚇";
  if (k.includes("bus")) return "🚌";
  if (k.includes("pharmacy")) return "💊";
  if (k.includes("hospital") || k.includes("clinic") || k.includes("doctor") || k.includes("dentist")) return "🏥";
  if (k.includes("police")) return "👮";
  if (k.includes("café") || k.includes("cafe")) return "☕";
  if (k.includes("restaurant") || k.includes("food") || k.includes("ice cream")) return "🍜";
  if (k.includes("toilet")) return "🚻";
  if (k.includes("atm") || k.includes("bank")) return "🏧";
  if (k.includes("hostel") || k.includes("residence") || k.includes("dormitory")) return "🏠";
  if (k.includes("college") || k.includes("university") || k.includes("school") || k.includes("library")) return "🎓";
  if (k.includes("park") || k.includes("garden")) return "🌳";
  if (k.includes("shop")) return "🛍️";
  return "📍";
}
