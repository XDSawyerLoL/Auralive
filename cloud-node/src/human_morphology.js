import { createHash } from 'node:crypto';

// Structural analysis of SWC reconstructions, not an electrical solver.
// SWC coordinates/radii are micrometers. No path is accepted here: callers
// supply the actual file bytes and an independently traceable specimen ID.
const kindNames=Object.freeze({1:'soma',2:'axon',3:'basal_dendrite',
  4:'apical_dendrite',5:'custom',6:'unspecified',7:'glia'});
const reasonable=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
const round=(x)=>Number(x.toFixed(6));
export const SWC_PROVENANCE_SOURCE='Allen Cell Types Database';

export function inspectSwc(text,{
  specimenId,claimedSpecies='Homo sapiens',maxNodes=200000,
}={}){
  if(typeof text!=='string'||text.length>25_000_000)
    throw new TypeError('SWC text required, max 25MB');
  if(!Number.isSafeInteger(specimenId)||specimenId<1000)
    throw new TypeError('Allen specimen ID required');
  if(claimedSpecies!=='Homo sapiens')
    throw new TypeError('Human SWC analysis requires Homo sapiens metadata');
  const nodes=new Map();
  for(const [lineIndex,raw] of text.split(/\r?\n/).entries()){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const pieces=line.split(/\s+/);
    if(pieces.length!==7)throw new TypeError('invalid SWC column count at line '+(lineIndex+1));
    const [id,k,x,y,z,r,parent]=pieces.map(Number);
    if(!Number.isSafeInteger(id)||id<=0||nodes.has(id)||
      !Number.isSafeInteger(k)||!kindNames[k]||
      !Number.isSafeInteger(parent)||parent===id||
      ![x,y,z].every(v=>reasonable(v,-1e6,1e6))||
      !reasonable(r,.001,1000))
      throw new TypeError('invalid SWC entry at line '+(lineIndex+1));
    nodes.set(id,{id,k,x,y,z,r,parent});
    if(nodes.size>maxNodes)throw new RangeError('SWC node budget exceeded');
  }
  if(nodes.size<2)throw new TypeError('SWC contains fewer than two nodes');
  const roots=[...nodes.values()].filter(n=>n.parent===-1);
  if(roots.length!==1||roots[0].k!==1)
    throw new TypeError('SWC requires one soma root');
  const rootId=roots[0].id;
  let surface=0,volume=0,totalCable=0;
  const counts={};
  const lengths={};
  const edges=[];
  for(const n of nodes.values()){
    const name=kindNames[n.k];
    counts[name]=(counts[name]||0)+1;
    if(n.parent===-1)continue;
    const parent=nodes.get(n.parent);
    if(!parent)throw new TypeError('SWC parent missing');
    const length=Math.hypot(n.x-parent.x,n.y-parent.y,n.z-parent.z);
    if(!(length>0))throw new TypeError('SWC zero-length segment');
    // Tapered cable model: frustum side area and volume (um², um³).
    const sideArea=Math.PI*(n.r+parent.r)*Math.hypot(length,n.r-parent.r);
    const cylinderVolume=Math.PI*length*
      (n.r*n.r+n.r*parent.r+parent.r*parent.r)/3;
    surface+=sideArea;
    volume+=cylinderVolume;
    totalCable+=length;
    lengths[name]=(lengths[name]||0)+length;
    edges.push({child:n.id,parent:n.parent});
  }
  // Explicit graph traversal rejects disconnected cycles, even if all
  // individual parent IDs exist.
  for(const node of nodes.values()){
    let cursor=node,steps=0;
    while(cursor.parent!==-1){
      cursor=nodes.get(cursor.parent);
      if(!cursor||++steps>=nodes.size)throw new TypeError('SWC cycle or disconnected tree');
    }
    if(cursor.id!==rootId)throw new TypeError('SWC disconnected component');
  }
  const hash=createHash('sha256').update(text,'utf8').digest('hex');
  return {
    model:'measured-human-morphology-topology-analysis',
    source:SWC_PROVENANCE_SOURCE,specimen_id:specimenId,
    claimed_species:claimedSpecies,source_hash_sha256:hash,
    source_authenticity_verified_by_server:false,
    node_count:nodes.size,root_id:rootId,segment_count:edges.length,
    compartment_type_counts:counts,
    total_cable_length_um:round(totalCable),
    tapered_segment_surface_area_um2:round(surface),
    tapered_segment_volume_um3:round(volume),
    length_by_child_type_um:Object.fromEntries(
      Object.entries(lengths).map(([k,v])=>[k,round(v)])),
    assumptions:[
      'SWC radii/coordinates interpreted as micrometers',
      'tapered cylinders approximate surface and volume',
      'soma cap surface excluded from tapered-segment area',
      'SWC alone does not identify synapses, ion channels, glia or physiology',
    ],
    human_cell_type_verified:false,
    morphology_is_biologically_authenticated:false,
    simulation_enabled:false,
  };
}
