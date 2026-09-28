/** Friendly emoji for a place kind label (from map data). */
export function kindEmoji(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("metro") || k.includes("subway") || k.includes("station")) return "🚇";
  if (k.includes("bus")) return "🚌";
  if (k.includes("pharmacy") || k.includes("drug") || k.includes("chemist")) return "💊";
  if (k.includes("hospital") || k.includes("clinic") || k.includes("doctor") || k.includes("dentist")) return "🏥";
  if (k.includes("police")) return "👮";
  if (k.includes("café") || k.includes("cafe") || k.includes("coffee")) return "☕";
  if (k.includes("bakery")) return "🥐";
  if (k.includes("supermarket") || k.includes("grocery") || k.includes("convenience")) return "🛒";
  if (k.includes("restaurant") || k.includes("food") || k.includes("ice cream")) return "🍜";
  if (k.includes("toilet")) return "🚻";
  if (k.includes("atm") || k.includes("bank")) return "🏧";
  if (k.includes("hostel") || k.includes("residence") || k.includes("dormitory")) return "🏠";
  if (k.includes("college") || k.includes("university") || k.includes("school") || k.includes("library")) return "🎓";
  if (k.includes("park") || k.includes("garden")) return "🌳";
  if (k.includes("shop")) return "🛍️";
  return "📍";
}

/** Line-icon name for a place kind label (system UI uses these instead of emoji). */
export function kindIcon(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("metro") || k.includes("subway") || k.includes("station") || k.includes("train")) return "transit";
  if (k.includes("bus")) return "bus";
  if (k.includes("airport")) return "airport";
  if (k.includes("pharmacy") || k.includes("drug") || k.includes("chemist")) return "pharmacy";
  if (k.includes("hospital") || k.includes("clinic") || k.includes("doctor") || k.includes("dentist")) return "hospital";
  if (k.includes("police")) return "police";
  if (k.includes("fuel") || k.includes("petrol") || k.includes("gas station")) return "fuel";
  if (k.includes("hotel") || k.includes("hostel") || k.includes("guest")) return "hotel";
  if (k.includes("café") || k.includes("cafe") || k.includes("coffee") || k.includes("bakery")) return "cafe";
  if (k.includes("supermarket") || k.includes("grocery") || k.includes("convenience")) return "store";
  if (k.includes("restaurant") || k.includes("food") || k.includes("ice cream")) return "food";
  if (k.includes("toilet")) return "toilet";
  if (k.includes("atm") || k.includes("bank")) return "atm";
  if (k.includes("residence") || k.includes("dormitory") || k === "home") return "home";
  if (k.includes("college") || k.includes("university") || k.includes("school") || k.includes("library")) return "school";
  if (k.includes("park") || k.includes("garden")) return "park";
  if (k.includes("shop") || k.includes("mall") || k.includes("market")) return "shop";
  return "pin";
}

/** Help Point class → line icon (the domain keeps its emoji for copy/tests; the UI draws these). */
export const HELP_ICON: Record<string, string> = {
  hospital: "hospital",
  police: "police",
  transit: "transit",
  airport: "airport",
  hotel: "hotel",
  pharmacy: "pharmacy",
  fuel: "fuel",
  convenience: "store",
};
