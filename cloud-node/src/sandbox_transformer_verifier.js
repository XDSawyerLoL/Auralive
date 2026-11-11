// INDEPENDENT OF THE MODEL. A separate deterministic observer recomputes
// the mathematical target; neither a language response nor an operator
// self-report is accepted as proof of task success.
import {createHash} from 'node:crypto';
const hex=x=>createHash('sha256').update(String(x)).digest('hex');
export const SANDBOX_VERIFIER_VERSION='sandbox-transformer-verifier-v1';
export function canonicalTarget(task={}){
  const x=Number(task.input);
  if(!Number.isSafeInteger(x)||x<0||x>100000)throw Error('invalid-sandbox-input');
  return x*3+7;
}
export function verifyTransformer({task={},result={},inspectionCost=1}={}){
 const actual=Number(result.value),expected=canonicalTarget(task);
 const valid=Number.isSafeInteger(actual)&&actual===expected;
 const inspected=result.inspected===true;
 const cost=inspected?Number(inspectionCost):0;
 if(cost!==1&&cost!==0)throw Error('inspection-must-cost-one-unit');
 const observation={context:task.context==='A'?'A':task.context==='B'?'B':'unknown',
  task_id:String(task.id||'').slice(0,70),exit_code:valid?0:1,
  success:valid,inspected,cost,expected_digest:hex(String(expected)),
  actual_digest:hex(String(actual)),verifier:SANDBOX_VERIFIER_VERSION,
  model_used:false,physical_server_action:false};
 observation.receipt=hex(JSON.stringify(observation));
 return Object.freeze(observation);
}
