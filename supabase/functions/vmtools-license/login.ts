// Contact email can differ from a legacy VinhMath Auth email. Resolve the link
// server-side; never change the existing identity or password.
export async function linkedPasswordLogin(input:any, services:any):Promise<string> {
 const invalid=()=>new Error('Tên đăng nhập hoặc mật khẩu VinhMath không đúng.');
 if(typeof input.email!=='string'||typeof input.password!=='string'||!input.password.length||input.password.length>128||input.email.length>254)throw invalid();
 let email=input.email.trim().toLowerCase();
 if(/^[a-z0-9_.-]{2,80}$/.test(email))email+='@hs.vinhmath.com';
 else if(/@(hs|gv)[a-z0-9]*$/.test(email))email+='.vinhmath.com';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw invalid();
 const account=await services.account(email);
 const identity=account?.auth_user_id?await services.identity(account.auth_user_id):null;
 // Keep Auth's password checks and rate limits; never accept an email match as proof.
 const auth=await services.signIn(identity?.email||email,input.password);
 if(auth.error||!account||!identity||auth.data?.user?.id!==account.auth_user_id||!auth.data?.session?.access_token)throw invalid();
 if(account.status==='blocked')throw new Error('Tài khoản VMTools đã bị khóa.');
 return auth.data.session.access_token;
}
