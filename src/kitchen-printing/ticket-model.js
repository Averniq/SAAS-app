import { DESTINATIONS, TICKET_VERSION } from "./contracts.js";
function text(value, max = 1000) {
  const t = String(value ?? "");
  if (t.length > max) throw Error("TICKET_TEXT_TOO_LONG");
  return t.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}
export function validatePrinter(config) {
  const name = String(config.name ?? "").trim(),
    ip = String(config.ip ?? "").trim(),
    port = Number(config.port ?? 9100),
    copies = Number(config.copies ?? 1);
  if (!name || name.length > 80)
    throw Error("Enter a printer name (1–80 characters).");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("Enter a port between 1024 and 65535.");
  if (!Number.isInteger(copies) || copies < 1 || copies > 3)
    throw Error("Select 1–3 copies.");
  if (ip) {
    const parts = ip.split(".");
    if (
      parts.length !== 4 ||
      parts.some((p) => !/^(0|[1-9][0-9]{0,2})$/.test(p) || Number(p) > 255)
    )
      throw Error("Enter a private LAN IPv4 address.");
    const [a, b, , d] = parts.map(Number);
    if (
      d === 0 ||
      d === 255 ||
      !(
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      )
    )
      throw Error("Use a private LAN printer address.");
  }
  return { ...config, name, ip: ip || null, port, copies };
}
export function buildTicketModel(snapshot) {
  if (
    snapshot.version !== TICKET_VERSION ||
    !DESTINATIONS.includes(snapshot.destination) ||
    ![1, 2, 3].includes(snapshot.copies) ||
    !Array.isArray(snapshot.items) ||
    snapshot.items.length < 1 ||
    snapshot.items.length > 200
  )
    throw Error("INVALID_TICKET");
  const date = new Date(snapshot.createdAt);
  if (!Number.isFinite(date.getTime())) throw Error("INVALID_TICKET_TIME");
  const timeLabel = new Intl.DateTimeFormat("en-AU", {
    timeZone: snapshot.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return {
    ...snapshot,
    restaurantName: text(snapshot.restaurantName, 200),
    tableName: text(snapshot.tableName || "Table", 200),
    orderNumber: text(snapshot.orderNumber, 80),
    instructions: text(snapshot.instructions),
    timeLabel,
    items: snapshot.items.map((i) => {
      if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)
        throw Error("INVALID_TICKET_QUANTITY");
      return {
        name: text(i.name, 500),
        quantity: i.quantity,
        notes: text(i.notes, 500),
        modifiers: (i.modifiers || []).map((m) => ({
          choiceName: text(m.choiceName, 200),
        })),
      };
    }),
  };
}
