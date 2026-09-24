import { cx } from "./cx";

export function Card({
  as: Tag = "section",
  className,
  children,
  ...rest
}: { as?: "section" | "div" | "article" | "li"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx("rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]", className)} {...rest}>
      {children}
    </Tag>
  );
}
