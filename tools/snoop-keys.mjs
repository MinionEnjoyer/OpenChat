#!/usr/bin/env node
const API='http://localhost:3001/api';let c=[];
async function api(p,opts={}){
  const h={};if(c.length)h.cookie=c.join('; ');
  if(!h['content-type']&&opts.method&&opts.body)h['content-type']='application/json';
  const r=await fetch(API+p,{...opts,headers:h,redirect:'manual'});
  const sc=r.headers.get('set-cookie');if(sc)c.push(sc.split(';')[0]);
  const t=await r.text();let b=t;try{b=JSON.parse(t)}catch{}
  return{status:r.status,body:b};
}
async function main(){
  const a=await api('/auth/dev-login',{method:'POST',body:JSON.stringify({username:'diag'})});
  console.log('User keys:',Object.keys(a.body).sort());
  const s=await api('/servers',{method:'POST',body:JSON.stringify({name:'DiagSrv'})});
  console.log('Server keys:',Object.keys(s.body).sort());
  const ch=await api('/servers/'+s.body.id+'/channels',{method:'POST',body:JSON.stringify({name:'d-ch',type:'TEXT'})});
  const m=await api('/channels/'+ch.body.id+'/messages',{method:'POST',body:JSON.stringify({content:'hi'})});
  console.log('Message keys:',Object.keys(m.body).sort());
  const inv=await api('/servers/'+s.body.id+'/invites',{method:'POST',body:'{}'});
  console.log('Invite keys:',Object.keys(inv.body).sort());
}
main().catch(e=>console.error(e));