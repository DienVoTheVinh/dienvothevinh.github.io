export const TRIAL_FEATURES=['ink','geometry2d','geometry3d','graphs','calculator'];
export function webTrial(policy:any,role:string,account:any){
 const eligible=!!policy&&account?.status!=='blocked'&&
  (policy.audience==='everyone'&&(!role||['teacher','admin'].includes(role))||policy.audience==='teachers'&&['teacher','admin'].includes(role));
 const features=eligible?TRIAL_FEATURES.filter(f=>policy.features.includes(f)):[];
 return {allowed:eligible&&features.length>0,features:features.length?[...features,...(features.includes('ink')?['pdf']:[]),'export']:[],audience:policy?.audience||'closed'};
}
