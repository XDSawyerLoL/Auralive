// Movement inference is a hypothesis about IMAGE-SPACE displacement.
// No claim of a person moving an object, physical speed, or intent.
const clamp=(x)=>Math.max(0,Math.min(1,x));
const center=b=>({x:(b.xmin+b.xmax)/2,y:(b.ymin+b.ymax)/2});
const finiteBox=b=>b&&['xmin','ymin','xmax','ymax'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])&&b[k]>=0&&b[k]<=1)&&b.xmax>b.xmin&&b.ymax>b.ymin;
const overlap=(a,b)=>{const w=Math.max(0,Math.min(a.xmax,b.xmax)-Math.max(a.xmin,b.xmin));
 const h=Math.max(0,Math.min(a.ymax,b.ymax)-Math.max(a.ymin,b.ymin));
 const aa=(a.xmax-a.xmin)*(a.ymax-a.ymin),bb=(b.xmax-b.xmin)*(b.ymax-b.ymin);
 return aa+bb-w*h>0?w*h/(aa+bb-w*h):0;};
export function inferImageSpaceMovement(a,b,{minDisplacement=.045,minOverlap=.1,maxGapMs=45000}={}){
 if(!a||!b||!finiteBox(a.box)||!finiteBox(b.box)||
   a.label!==b.label||a.label==null||a.trusted!==false||b.trusted!==false)return null;
 const t1=Date.parse(String(a.at||'')),t2=Date.parse(String(b.at||''));
 if(!Number.isFinite(t1)||!Number.isFinite(t2)||t2<=t1||t2-t1>maxGapMs)return null;
 const ac=center(a.box),bc=center(b.box),dx=bc.x-ac.x,dy=bc.y-ac.y;
 const displacement=Math.sqrt(dx*dx+dy*dy),iou=overlap(a.box,b.box);
 if(iou<minOverlap||displacement<minDisplacement)return null;
 const direction=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
 return {kind:'object-image-displacement-hypothesis',at:new Date(t2).toISOString(),
   label:'browser-object-motion-hypothesis',direction,
   displacement:Math.round(clamp(displacement)*1000)/1000,
   overlap:Math.round(iou*1000)/1000,
   evidence_scope:'two-client-detections-image-coordinates-only',
   verified_real_world:false,person_causation_known:false,camera_motion_excluded:false};
}
