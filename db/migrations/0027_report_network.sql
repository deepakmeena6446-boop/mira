-- 0027_report_network (forward-only). Separate statements with the drizzle breakpoint marker line.
-- Audit P14-001: one person with five browsers counted as five independent reporters. Each report now carries a keyed
-- hash of its network's coarse prefix (IPv4 /24, IPv6 /48), salted per ISO week so it can't link reports across weeks,
-- and a community note needs contributors from several networks. Nullable: earlier reports have none. Additive.
ALTER TABLE reports_private ADD COLUMN network_hash text;
