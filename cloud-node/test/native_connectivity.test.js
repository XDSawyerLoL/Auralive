import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {nativeNamespaceComparison,nativeTcpDial,ownNamespaceListener} from '../src/native_connectivity.js';

test('network namespace comparison reveals isolation without leaking inode IDs',()=>{
  const readlink=(path)=>path==='/proc/self/ns/net'?'net:[4026009999]'
    :path==='/proc/900/ns/net'?'net:[4026007777]':'nope';
  const info=nativeNamespaceComparison(900,{platform:'linux',readlink});
  assert.deepEqual(info,{inspection:'ok',same_network_namespace:false});
  assert.doesNotMatch(JSON.stringify(info),/402600|900/);
  const same=nativeNamespaceComparison(900,{platform:'linux',
    readlink:()=> 'net:[4026009999]'});
  assert.equal(same.same_network_namespace,true);
  assert.equal(nativeNamespaceComparison(900,{platform:'win32',readlink}).inspection,'unavailable');
  assert.equal(nativeNamespaceComparison(900,{platform:'linux',
    readlink:()=>{throw Error('secret path');}}).inspection,'unavailable');
});

test('kernel listing in Node namespace confirms expected IPv4 LISTEN port',()=>{
  const data=[
    'sl local_address rem_address st tx_queue tr:tm->when retrnsmt uid timeout inode',
    '0: 0100007F:A0BB 00000000:0000 0A 0:0 00:0 0 0 11 1',
    '1: 0100007F:A0BC 00000000:0000 01 0:0 00:0 0 0 12 1',
  ].join('\n');
  const input={platform:'linux',read:(p)=>{
    assert.equal(p,'/proc/self/net/tcp');return data;
  }};
  assert.deepEqual(ownNamespaceListener(0xA0BB,input),{
    inspection:'ok',ipv4_listening:true,
  });
  assert.deepEqual(ownNamespaceListener(0xA0BC,input),{
    inspection:'ok',ipv4_listening:false,
  });
  assert.equal(ownNamespaceListener(0xA0BB,{
    platform:'linux',read:()=>{throw Error('denied');},
  }).inspection,'unavailable');
});

test('direct IPv4 dial succeeds to a real local TCP listener',async()=>{
  const server=net.createServer(socket=>{socket.on('error',()=>{});socket.resume();});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    assert.deepEqual(await nativeTcpDial(server.address().port),{result:'connected'});
  }finally{server.close();await once(server,'close');}
});

test('direct IPv4 dial reports refused when the ephemeral listener is closed',async()=>{
  const server=net.createServer(()=>{});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  server.close();await once(server,'close');
  assert.deepEqual(await nativeTcpDial(port),{result:'connection-refused'});
});
