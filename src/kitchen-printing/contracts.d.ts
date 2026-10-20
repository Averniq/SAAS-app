export type Destination = "Kitchen" | "Bar" | "Dessert";
export type DeliveryOutcome = "not_sent" | "transmitted" | "uncertain";
export interface TicketItem {
  name: string;
  quantity: number;
  notes: string;
  modifiers: { choiceName: string }[];
}
export interface TicketSnapshotV1 {
  version: 1;
  restaurantName: string;
  timezone: string;
  orderNumber: string | number;
  tableName: string;
  createdAt: string;
  destination: Destination;
  copies: 1 | 2 | 3;
  autoCut: boolean;
  instructions: string;
  items: TicketItem[];
  reprint?: boolean;
}
export interface NativePrintAgent {
  setSession(session: {
    accessToken: string;
    expiresAt: number;
    restaurantId: string;
    operatorId: string;
  }): Promise<void>;
  beginPairing(config: {
    restaurantId: string;
    deviceName: string;
  }): Promise<{ id: string }>;
  activatePairing(config: { pairingId: string }): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<{ state: string; message: string }>;
}
