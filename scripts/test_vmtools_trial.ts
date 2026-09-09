import {webTrial,TRIAL_FEATURES} from '../supabase/functions/_shared/vmtools-trial.ts';
function check(value:boolean,message:string){if(!value)throw Error(message)}
const closed={audience:'closed',features:TRIAL_FEATURES},teachers={...closed,audience:'teachers'},everyone={...closed,audience:'everyone'};
for(const role of ['', 'student','parent','teacher','admin'])check(!webTrial(closed,role,null).allowed,'Closed must deny '+role);
for(const role of ['', 'student','parent'])check(!webTrial(teachers,role,null).allowed,'Teachers excludes '+role);
for(const role of ['teacher','admin'])check(webTrial(teachers,role,null).allowed,'Teachers includes '+role);
check(webTrial(everyone,'',null).allowed,'Guests can experience when enabled');
check(!webTrial(everyone,'student',null).allowed,'Student account does not gain teacher access');
for(const role of ['teacher','admin'])check(!webTrial(everyone,role,{status:'blocked'}).allowed,'Blocked remains blocked');
const limited=webTrial({audience:'everyone',features:['calculator','download','app']},'',null);
check(JSON.stringify(limited.features)==='["calculator","export"]','Only selected tools; no desktop/download');
check(!webTrial({audience:'everyone',features:[]},'',null).allowed,'Empty feature set denies');
check(webTrial({audience:'teachers',features:['ink']},'teacher',null).features.includes('pdf'),'Ink can annotate PDF');
console.log('PASS trial closed/teacher/guest/blocked matrices and independent feature allow-list');
