export function derivePrinterStatus(
  { printer, devices = [] },
  now = Date.now(),
) {
  if (!printer.ip || !printer.enabled) return "Not Configured";
  if (printer.attention) return "Attention Required";
  const agents = devices.filter(
    (d) =>
      !d.revoked_at &&
      d.printer_ids?.includes(printer.id) &&
      now - Date.parse(d.last_seen_at) < 60000,
  );
  if (!agents.length) return "Agent Offline";
  if (printer.printing) return "Printing";
  return agents.some(
    (d) =>
      d.observations?.[printer.id]?.reachable &&
      now - Date.parse(d.observations[printer.id].observedAt) < 60000,
  )
    ? "Ready"
    : "Printer Unreachable";
}
