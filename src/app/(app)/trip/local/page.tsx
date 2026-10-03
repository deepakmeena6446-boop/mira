import type { Metadata } from "next";
import { LocalCheckInScreen } from "./LocalCheckInScreen";

export const metadata: Metadata = { title: "Private check-in" };

export default function LocalCheckInPage() {
  return <LocalCheckInScreen />;
}
