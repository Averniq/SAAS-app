import {PRINT_STATUS} from './contracts.js';
export function derivePrinterStatus({configuration,agentHeartbeat,observation,activeJob,unresolvedAttempt},now=Date.now()){
 const result=(key,detail)=>({key,label:PRINT_STATUS[key],detail,paperConfirmed:false});
 const fresh=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+5000&&now-Date.parse(value)<60000;
 if(unresolvedAttempt?.state==='uncertain'||['uncertain','failed'].includes(activeJob?.state))return result('attention','Delivery requires review. Never retry uncertain paper automatically.');
 if(!configuration?.enabled||!configuration.ip)return result('notConfigured','Enter the printer LAN IP and enable this printer.');
 if(!agentHeartbeat?.active||!agentHeartbeat.assigned||!fresh(agentHeartbeat.lastHeartbeat))return result('agentOffline','Open the paired Android app, sign in and keep Kitchen in the foreground.');
 if(!observation||observation.configRevision!==configuration.config_revision||!fresh(observation.observedAt))return result('attention','Printer connectivity is unknown. Check the tablet and LAN configuration.');
 if(observation.status==='unreachable')return result('unreachable','Check printer power, LAN cable/Wi-Fi and IP. Orders continue in Kitchen.');
 if(observation.status!=='reachable')return result('attention','Printer needs attention. Paper and cover status are unknown; inspect the printer.');
 if(['leased','dispatching'].includes(activeJob?.state))return result('printing','Sending ticket. Physical paper is not confirmed.');
 if(activeJob?.state==='retry_wait')return result('attention','Known unsent failure. A bounded automatic retry is pending.');
 return result('ready','LAN connection available. Paper and cutting remain unconfirmed.');
}
