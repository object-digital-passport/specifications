import {expect} from 'chai';
import fs from 'node:fs';
import {variantLeaf,verifyVariant} from '../../tools/edition.mjs';
import {preparePassport} from '../../tools/passport.mjs';
const vector=JSON.parse(fs.readFileSync(new URL('../../../schema/vectors/edition-units.json',import.meta.url))).variantCommitment;
describe('0.7 optional variant commitments',()=>{
 it('all sealed variants verify; a changed variant, salt or index fails',()=>{
  for(const u of vector.units){expect(variantLeaf(u.index,u.variant,u.salt)).eq(u.leaf);expect(verifyVariant(vector.root,u.index,u.variant,u.salt,u.proof)).eq(true);expect(verifyVariant(vector.root,u.index,u.variant+'!',u.salt,u.proof)).eq(false);expect(verifyVariant(vector.root,u.index,u.variant,'0x'+'00'.repeat(32),u.proof)).eq(false);expect(verifyVariant(vector.root,(u.index+1)%5,u.variant,u.salt,u.proof)).eq(false);}
 });
 it('uses NFC UTF-8 byte length and rejects excess length',()=>{
  const u=vector.units[4];expect(variantLeaf(u.index,'e\u0301',u.salt)).eq(u.leaf);expect(()=>variantLeaf(0,'x'.repeat(65536),u.salt)).throws();expect(()=>variantLeaf(0,'\ud800',u.salt)).throws();
 });
 it('rejects mismatched counts between edition, unit keys and variant commitments',()=>{
  const d=JSON.parse(fs.readFileSync(new URL('../../../schema/examples/0.7/edition.json',import.meta.url)));d.anchors.find(a=>a.type==='unit_variant_commit').data.unitCount=100000;expect(()=>preparePassport(d)).throws('Variant unit count mismatch');
 });
});
