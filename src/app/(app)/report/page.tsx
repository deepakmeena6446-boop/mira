import { parseReportFrom } from "@/lib/report-groups";
import type { Metadata } from "next";
import { CATEGORIES, type Category } from "@/domain/report/taxonomy";
import { ReportScreen } from "./ReportScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const c = typeof sp.c === "string" && (CATEGORIES as readonly string[]).includes(sp.c) ? (sp.c as Category) : null;
  return <ReportScreen preset={c} from={parseReportFrom(sp.from)} />;
}
