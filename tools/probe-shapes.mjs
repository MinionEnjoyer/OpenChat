#!/usr/bin/env node
const API='http://localhost:3001/api';let c=[];
async function api(p,opts={}){
  const h={};if(c.length)h.cookie=c.join('; ');
  if(!h['content-type']&&opts.method&&opts.body)h['content-type']='application/json';
  const r=await fetch(API+p,{...opts,headers:h,redirect:'manual'});
  const sc=r.headers.get('set-cookie');if(sc)c.push(sc.split(';')[0]);
  const t=await r.text();try{return JSON.parse(t)}catch{return t};
}
async function main(){
  await api('/auth/dev-login',{method:'POST',body:JSON.stringify({username:'probe'})});
  const s=await api('/servers',{method:'POST',body:JSON.stringify({name:'Ps'})});
  const ch=await api('/servers/'+s.id+'/channels',{method:'POST',body:JSON.stringify({name:'pc',type:'TEXT'})});
  const msg=await api('/channels/'+ch.id+'/messages',{method:'POST',body:JSON.stringify({content:'p'})});
  const re=await api('/messages/'+msg.id+'/reactions',{method:'POST',body:JSON.stringify({emoji:'👍'})});
  console.log('reaction[0]:',JSON.stringify(re.reactions[0]));
  const inv=await api('/servers/'+s.id+'/invites',{method:'POST',body:'{}'});
  console.log('invite:',JSON.stringify(inv));
  // Test pin on fresh msg
  const fm=await api('/channels/'+ch.id+'/messages',{method:'POST',body:JSON.stringify({content:'pf'})});
  const pin=await api('/messages/'+fm.id+'/pin',{method:'PATCH'});
  console.log('pin status:',pin?.status||'ok','has pinned:',typeof pin);
}
main().catch(e=>console.error(e));