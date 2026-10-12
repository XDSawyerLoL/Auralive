import fs from 'node:fs';
import net from 'node:net';

// Safe, path-free comparison of the running Node app and its native child.
// A listener held in another Linux network namespace will not accept Node's
// requests to 127.0.0.1, even if /proc/<child>/net/tcp reports it as listening.
export function nativeNamespaceComparison(pid,{
  platform=process.platform,readlink=fs.readlinkSync,
}={}){
  const unknown={inspection:'unavailable',same_network_namespace:null};
  if(platform!=='linux'||!Number.isSafeInteger(pid)||pid<=0||pid>2147483647)return unknown;
  try{
    const own=String(readlink('/proc/self/ns/net'));
    const child=String(readlink('/proc/'+pid+'/ns/net'));
    if(!/^net:\[\d+\]$/.test(own)||!/^net:\[\d+\]$/.test(child))return unknown;
    return {inspection:'ok',same_network_namespace:own===child};
  }catch{return unknown;}
}

// Independent kernel TCP dial (without HTTP request parsing, fetch, proxies or
// global agents). This is diagnostic only and never a substitute for a real
// /v1/chat/completions response proving token generation.
export function nativeTcpDial(port,{connect=net.createConnection,timeoutMs=1200}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)
    return Promise.resolve({result:'invalid-port'});
  return new Promise(resolve=>{
    let socket;
    let settled=false;
    const done=(result)=>{
      if(settled)return;
      settled=true;
      try{socket?.destroy();}catch{}
      resolve({result});
    };
    try{
      socket=connect({host:'127.0.0.1',family:4,port});
      socket.once('connect',()=>done('connected'));
      socket.once('timeout',()=>done('timeout'));
      socket.once('error',error=>{
        const code=String(error?.code||'');
        done(code==='ECONNREFUSED'?'connection-refused'
          :code==='EACCES'||code==='EPERM'?'permission-denied'
          :code==='EHOSTUNREACH'||code==='ENETUNREACH'?'network-unreachable'
          :'tcp-error');
      });
      socket.setTimeout(Math.max(200,Math.min(3000,Number(timeoutMs)||1200)));
    }catch{done('tcp-error');}
  });
}

// See whether Node's own namespace exposes a kernel TCP LISTEN socket at the
// expected IPv4 address. The kernel-level child socket evidence separately
// proves which process owns that socket; this checks only network visibility.
export function ownNamespaceListener(port,{platform=process.platform,read=fs.readFileSync}={}){
  const unknown={inspection:'unavailable',ipv4_listening:null};
  if(platform!=='linux'||!Number.isInteger(port)||port<1024||port>65535)return unknown;
  let data;
  try{data=String(read('/proc/self/net/tcp','utf8'));}
  catch{return unknown;}
  for(const line of data.split('\n').slice(1,4096)){
    const fields=line.trim().split(/\s+/);
    if(fields.length<4||fields[3]!=='0A')continue;
    const [address,rawPort]=String(fields[1]||'').split(':');
    if(!['0100007F','00000000'].includes(String(address).toUpperCase()))continue;
    if(parseInt(rawPort,16)===port)return {inspection:'ok',ipv4_listening:true};
  }
  return {inspection:'ok',ipv4_listening:false};
}
