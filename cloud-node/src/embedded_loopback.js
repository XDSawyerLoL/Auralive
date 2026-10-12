import http from 'node:http';

// Direct, IPv4-only transport for the local native model.
// Unlike ambient fetch/global dispatchers, this cannot be redirected by
// HTTP(S)_PROXY, Node fetch wrappers or custom global Agent settings.
export function nativeLoopbackRequest(url, {
  method='GET',headers={},body='',signal,
}={}){
  let destination;
  try{destination=new URL(url);}catch{throw Error('embedded-loopback-invalid-url');}
  const port=Number(destination.port);
  if(destination.protocol!=='http:' || destination.hostname!=='127.0.0.1'
    || !Number.isInteger(port)||port<1024||port>65535
    || !['/health','/v1/chat/completions'].includes(destination.pathname)
    || destination.username||destination.password||destination.search||destination.hash){
    throw Error('embedded-loopback-destination-rejected');
  }
  const verb=String(method).toUpperCase();
  if((destination.pathname==='/health'&&verb!=='GET')
    ||(destination.pathname==='/v1/chat/completions'&&verb!=='POST')){
    throw Error('embedded-loopback-method-rejected');
  }
  return new Promise((resolve,reject)=>{
    const request=http.request({
      hostname:'127.0.0.1',family:4,port,path:destination.pathname,
      method:verb,headers,signal,agent:false,
    },response=>{
      const chunks=[];
      let size=0;
      response.on('data',chunk=>{
        size+=chunk.length;
        if(size>1024*1024){
          request.destroy(Error('embedded-loopback-response-too-large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>{
        const raw=Buffer.concat(chunks).toString('utf8');
        resolve({
          ok:response.statusCode>=200&&response.statusCode<300,
          status:response.statusCode,
          async json(){return JSON.parse(raw);},
        });
      });
    });
    request.on('error',reject);
    if(body)request.write(body);
    request.end();
  });
}

// Log lines are not proof that a socket is actually accepting connections.
// Never expose the raw log, IP address or random ephemeral port to clients.
export function nativeListenerEvidence(log,expectedPort){
  const pattern=/server is listening on http:\/\/([^\s/]+):(\d{2,5})/gi;
  const ports=[];
  let match;
  while((match=pattern.exec(String(log||'')))!==null){
    const announced=Number(match[2]);
    if(announced>0&&announced<=65535){
      ports.push({matching_port:announced===expectedPort,
        family:match[1]==='127.0.0.1'?'ipv4-loopback'
          :match[1]==='0.0.0.0'?'ipv4-all'
          :match[1].startsWith('[')?'ipv6':'other'});
    }
  }
  return ports.at(-1)||{matching_port:null,family:'not-reported'};
}
