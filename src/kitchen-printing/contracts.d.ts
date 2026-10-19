export type Destination = 'Kitchen' | 'Bar' | 'Dessert';
export type DeliveryState = 'queued' | 'leased' | 'dispatching' | 'retry_wait' | 'transmitted' | 'uncertain' | 'failed' | 'resolved';
export interface TicketSnapshotV1 { version:1; restaurantName:string; timezone:string; orderNumber:string; tableLabel?:string|null; createdAt:string; destination:Destination; items:{id:string;name:string;quantity:number;modifiers:(string|{groupName?:string;choiceName:string})[];notes?:string}[]; instructions?:string; copies:number;autoCut:boolean;profile:'escpos-80mm-v1';kind:'automatic'|'test'|'reprint';sourceProtocol?:'legacy_v1' }
export interface TicketModelV1 { version:1;profile:string;autoCut:boolean;copies:{lines:{text:string;large:boolean}[]}[] }
export interface PrinterConfiguration { id:string;restaurant_id:string;name:string;ip:string|null;port:number;enabled:boolean;auto_print:boolean;auto_cut:boolean;copies:number;destination:Destination;config_revision:number }
export interface AgentSession { accessToken:string;expiresAt:number;restaurantId:string;operatorId:string }
export interface KitchenNativeAgent { setSession(session:AgentSession):Promise<void>;beginPairing(options:{restaurantId:string;deviceName:string}):Promise<{pairingId:string;expiresAt:string}>;activatePairing(options:{pairingId:string}):Promise<{deviceId:string}>;start():Promise<void>;stop():Promise<void>;getStatus():Promise<{state:string;code?:string}> }
export const PRINT_PROFILE:Readonly<{name:string;columns:number;dots:number;maxBytes:number}>;
export const PRINT_STATUS:Readonly<Record<string,string>>;
export function cleanTicketText(value:unknown,required?:boolean):string;
export function cellWidth(character:string):number;
export function wrapTicketText(text:string,columns?:number):string[];
