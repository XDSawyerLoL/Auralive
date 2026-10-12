import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSocketEvidence} from '../src/native_socket_evidence.js';

function fixture({local='0100007F:8398',inode='74620',fdInode=inode,ipv6=false}={}){
  const reads={
    '/proc/513/fd/3':'socket:['+fdInode+']',
    '/proc/513/net/tcp':[
      'sl local_address rem_address st tx_queue tr:tm->when retrnsmt uid timeout inode',
      ipv6?'':'0: '+local+' 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 '+inode+' 1',
    ].join('\n'),
    '/proc/513/net/tcp6':[
      'sl local_address rem_address st tx_queue tr:tm->when retrnsmt uid timeout inode',
      ipv6?'0: 00000000000000000000000001000000:8398 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 '+inode+' 1':'',
    ].join('\n'),
  };
  return {
    platform:'linux',
    readdir:(p)=>{assert.equal(p,'/proc/513/fd');return ['0','1','3'];},
    readlink:(p)=>p.endsWith('/3')?reads['/proc/513/fd/3']:'pipe:[2]',
    read:(p)=>{if(!(p in reads))throw Error('path forbidden');return reads[p];},
  };
}
test('native kernel socket confirms matching IPv4 listener only for this process',()=>{
  const info=nativeSocketEvidence(513,0x8398,fixture());
  assert.deepEqual(info,{inspection:'ok',listening:true,expected_port:true,
    ipv4_listener:true,ipv6_listener:false});
  assert.doesNotMatch(JSON.stringify(info),/513|74620|8398/);
});
test('real listener at another port is reported as mismatch',()=>{
  const info=nativeSocketEvidence(513,0x8399,fixture());
  assert.equal(info.listening,true);
  assert.equal(info.expected_port,false);
  assert.equal(info.ipv4_listener,true);
});
test('IPv6-only listening cannot satisfy the strictly IPv4 HTTP probe',()=>{
  const info=nativeSocketEvidence(513,0x8398,fixture({ipv6:true}));
  assert.equal(info.listening,true);
  assert.equal(info.ipv4_listener,false);
  assert.equal(info.ipv6_listener,true);
  assert.equal(info.expected_port,false);
});
test('unowned listening socket in shared namespace is ignored',()=>{
  const info=nativeSocketEvidence(513,0x8398,fixture({fdInode:'77'}));
  assert.equal(info.listening,false);
  assert.equal(info.expected_port,false);
});
test('unsupported /proc access must be unknown, not falsely diagnosed as no listener',()=>{
  const info=nativeSocketEvidence(513,0x8398,{
    platform:'linux',readdir:()=>{throw Error('permission denied');},
  });
  assert.deepEqual(info,{inspection:'unavailable',listening:null,
    expected_port:null,ipv4_listener:null,ipv6_listener:null});
  assert.equal(nativeSocketEvidence(-1,0x8398,{platform:'linux'}).inspection,'unavailable');
  assert.equal(nativeSocketEvidence(513,0x8398,{platform:'win32'}).inspection,'unavailable');
});
