import fs from 'node:fs';

// Read only this AURA-spawned process's /proc descriptors and network namespace.
// Never expose socket inode numbers, ports, fd names or network addresses.
export function nativeSocketEvidence(pid, expectedPort, {
  platform=process.platform,
  readdir=fs.readdirSync,
  readlink=fs.readlinkSync,
  read=fs.readFileSync,
}={}) {
  const unknown={inspection:'unavailable',listening:null,expected_port:null,
    ipv4_listener:null,ipv6_listener:null};
  if(platform!=='linux'||!Number.isSafeInteger(pid)||pid<=0||pid>2147483647
    ||!Number.isInteger(expectedPort)||expectedPort<1||expectedPort>65535) return unknown;
  const root='/proc/'+pid;
  const sockets=new Set();
  try{
    for(const fd of readdir(root+'/fd').slice(0,1024)){
      if(!/^\d{1,6}$/.test(String(fd)))continue;
      try{
        const target=String(readlink(root+'/fd/'+fd));
        const match=/^socket:\[(\d+)\]$/.exec(target);
        if(match)sockets.add(match[1]);
      }catch{} // A process may close its descriptors during inspection.
    }
  }catch{return unknown;}
  let inspected=0,listen=false,match=false,v4=false,v6=false;
  for(const [type,file] of [['ipv4','tcp'],['ipv6','tcp6']]){
    let data;
    try{data=String(read(root+'/net/'+file,'utf8'));inspected++;}
    catch{continue;}
    for(const line of data.split('\n').slice(1,4096)){
      const fields=line.trim().split(/\s+/);
      // st=0A is TCP_LISTEN; column 9 is inode in /proc/net/tcp.
      if(fields.length<10||fields[3]!=='0A'||!sockets.has(fields[9]))continue;
      const local=String(fields[1]||'').split(':');
      if(local.length!==2)continue;
      const port=parseInt(local[1],16);
      if(!Number.isFinite(port))continue;
      listen=true;
      if(type==='ipv4')v4=true;else v6=true;
      // The Node transport explicitly uses 127.0.0.1 IPv4.
      if(type==='ipv4'&&port===expectedPort
        &&['0100007F','00000000'].includes(local[0].toUpperCase()))match=true;
    }
  }
  if(!inspected)return unknown;
  return {inspection:'ok',listening:listen,expected_port:match,
    ipv4_listener:v4,ipv6_listener:v6};
}
