// Prove that the published compact dependency model is reproducible from the
// exact pinned UD TRAIN split, not from manually invented sentence patterns.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [generated,committed]=await Promise.all(process.argv.slice(2,4)
  .map(path=>readFile(path,'utf8').then(JSON.parse)));
if(!generated||!committed)throw Error('Specify regenerated model and committed model');
assert.equal(generated.schema,committed.schema);
assert.deepEqual(generated.provenance,committed.provenance);
assert.deepEqual(generated.stats,committed.stats);
function asSortedRows(data,key){
 assert.ok(Array.isArray(data[key]));
 return data[key].map(row=>JSON.stringify(row)).sort();
}
for(const field of ['constructions','dependency_edges','negation_children','verb_forms']){
 assert.deepEqual(asSortedRows(generated,field),asSortedRows(committed,field),
   'Dependency-trained data mismatch in '+field);
}
console.log(JSON.stringify({reproducible:true,trained_from:generated.provenance,
  constructions:generated.constructions.length,verb_forms:generated.verb_forms.length}));
