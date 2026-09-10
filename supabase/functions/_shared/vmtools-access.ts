export const VM_FEATURES = ['ink','pdf','geometry2d','geometry3d','graphs','calculator','export'];
export function vmAccess(account: any, role: string, now = Date.now()) {
  const active = !!account && ['teacher','admin','student'].includes(role) && account.status === 'active' &&
    (account.role === 'owner' || account.plan === 'lifetime' || Date.parse(account.paid_until) > now);
  return {active, download:active && account.download_enabled !== false,
    desktop:active && account.app_enabled !== false, web:active && account.web_enabled === true};
}
export function teacherGrant(body: any) {
  const classroom = body.classroom || {enabled:true,plan:'lifetime',units:1,amount:0};
  const vm = body.vmtools || {plan:'pending',units:1,amount:0,webEnabled:false};
  const validate = (g:any, pending:boolean) => {
    if (![...(pending?['pending']:[]),'monthly','yearly','custom','lifetime'].includes(g.plan) ||
      !Number.isInteger(g.units)||g.units<1||g.units>120||!Number.isFinite(g.amount)||g.amount<0 ||
      (g.plan==='custom' && !(Date.parse(g.until)>Date.now()))) throw Error('Gói dịch vụ hoặc thời hạn không hợp lệ');
  };
  validate(classroom,false); validate(vm,true);
  if (vm.plan!=='pending' && vm.confirmGrant!==true) throw Error('Hãy xác nhận cấp quyền VMTools');
  const selected = vm.features ?? VM_FEATURES;
  if (!Array.isArray(selected)||selected.some((f:any)=>!VM_FEATURES.includes(f))) throw Error('Tính năng VMTools không hợp lệ');
  return {classroom:{...classroom,enabled:classroom.enabled===true},vmtools:{...vm,features:[...new Set(selected)],
    appEnabled:vm.appEnabled!==false,downloadEnabled:vm.downloadEnabled!==false,webEnabled:vm.webEnabled===true}};
}
