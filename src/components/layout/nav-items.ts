export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/know", label: "Know", icon: "know" },
  { href: "/accompany", label: "Accompany", icon: "accompany" },
  { href: "/report", label: "Report", icon: "report" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
