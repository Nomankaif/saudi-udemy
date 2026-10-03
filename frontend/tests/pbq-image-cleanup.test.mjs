import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(new URL("../package.json", import.meta.url));
const compile = file => ts.transpileModule(readFileSync(new URL("../" + file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helperContext={exports:{}};
vm.runInNewContext(compile("lib/pbq-image-cleanup.ts"),helperContext);
const helpers=helperContext.exports;
const plain = value => JSON.parse(JSON.stringify(value));
test("erase geometry maps zoomed displays to original pixels and supports reverse drags",()=>{
  const start=helpers.imagePoint({x:60,y:30},{left:10,top:10,width:200,height:100},{width:1000,height:500});
  assert.deepEqual(plain(start),{x:250,y:100});
  assert.deepEqual(plain(helpers.eraseRect({x:40.2,y:30.8},{x:10.8,y:9.1})),{x:10,y:9,width:31,height:22});
  assert.deepEqual(plain(helpers.imagePoint({x:-10,y:999},{left:10,top:10,width:200,height:100},{width:1000,height:500})),{x:0,y:500});
  for(const rect of [{x:-1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:0,y:0,width:101,height:1},{x:NaN,y:0,width:1,height:1}])
    assert.equal(helpers.validEraseRect(rect,{width:100,height:100}),false);
});
test("flattening replaces selected pixels and leaves other pixels untouched; undo restores source",()=>{
  const original=Array(100).fill(20),pixels=Array(100).fill(0);
  const context={
    clearRect(){pixels.fill(0);},
    drawImage(source){source.forEach((value,i)=>{pixels[i]=value;});},
    fillStyle:"",
    fillRect(x,y,width,height){assert.equal(this.fillStyle,"#ffffff");for(let row=y;row<y+height;row++)for(let col=x;col<x+width;col++)pixels[row*10+col]=255;}
  };
  helpers.paintCleanImage(context,original,10,10,[{x:2,y:3,width:4,height:2}]);
  assert.equal(pixels.filter(v=>v===255).length,8);
  assert.equal(pixels[32],255);assert.equal(pixels[31],20);assert.equal(pixels[56],20);
  assert.equal(original[32],20);
  helpers.paintCleanImage(context,original,10,10,[]);
  assert.deepEqual(pixels,original);
});
function cleanerHarness(fail=false) {
  const state=[],refs=[],effects=[],calls=[],paint=[];
  let cursor=0,refCursor=0,initial=true,closed=0,applied="";
  const context2d={clearRect(){paint.push("clear");},drawImage(){paint.push("source");},fillRect(){paint.push("erase");}};
  const canvas={getContext:()=>context2d,toBlob:callback=>callback(new Blob(["flattened"],{type:"image/png"}))};
  const modules={
    "react/jsx-runtime":require("react/jsx-runtime"),
    react:{useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],v=>{state[i]=typeof v==="function"?v(state[i]):v;}];},
      useRef(value){const i=refCursor++;return refs[i] ||= {current:value};},useEffect(fn){if(initial)effects.push(fn);}},
    "react-dom":{createPortal:element=>element},
    "@/lib/pbq-image-cleanup":helpers,
    "@/lib/api":{api:async(...args)=>{calls.push(args);if(fail)throw new Error("Upload failed");return{url:"/uploads/media/new-cleaned.png"};},messageOf:e=>e.message}
  };
  const sandbox={exports:{},require:name=>{assert.ok(name in modules,name);return modules[name];},fetch:async()=>({ok:true,blob:async()=>new Blob(["source"])}),
    createImageBitmap:async()=>({width:100,height:100,close(){}}),AbortController,Blob,FormData,document:{body:{},createElement:()=>canvas}};
  vm.runInNewContext(compile("components/admin/pbq-image-cleaner.tsx"),sandbox);
  function render(){cursor=0;refCursor=0;const nodes=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n?.props)return;nodes.push(n);visit(n.props.children);}visit(sandbox.exports.PbqImageCleaner({imageUrl:"/uploads/media/original.png",onApply:url=>{applied=url;},onClose:()=>{closed++;}}));initial=false;return nodes;}
  async function load(){render();refs[0].current={showModal(){},close(){}};effects.forEach(fn=>fn());await new Promise(resolve=>setTimeout(resolve,0));}
  function button(label){const found=render().find(n=>n.type==="button"&&n.props.children===label);assert.ok(found,label);return found;}
  return{load,render,button,calls,paint,get applied(){return applied;},get closed(){return closed;}};
}
test("cleaner uploads a flattened copy only on apply, never sends original URL or edit history",async()=>{
  const h=cleanerHarness();await h.load();
  assert.equal(h.button("Apply cleaned image").props.disabled,true);
  h.button("Erase rectangle").props.onClick();
  assert.equal(h.calls.length,0);
  h.button("Apply cleaned image").props.onClick();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.applied,"/uploads/media/new-cleaned.png");
  assert.deepEqual(h.paint,["clear","source","erase"]);
  const [url,request]=h.calls[0];
  assert.equal(url,"/media/pbq");assert.equal(request.method,"POST");
  assert.deepEqual([...request.body.keys()],["file"]);
  assert.equal(await request.body.get("file").text(),"flattened");
});
test("cleaner cancel and undo do not upload; failed upload retains edits for retry",async()=>{
  const h=cleanerHarness(true);await h.load();
  h.button("Erase rectangle").props.onClick();
  h.button("Undo last erase").props.onClick();
  assert.equal(h.button("Apply cleaned image").props.disabled,true);
  h.button("Erase rectangle").props.onClick();
  h.button("Restore all").props.onClick();
  assert.equal(h.button("Apply cleaned image").props.disabled,true);
  h.button("Erase rectangle").props.onClick();
  h.button("Apply cleaned image").props.onClick();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(h.applied,"");
  assert.equal(h.button("Apply cleaned image").props.disabled,false);
  assert.ok(h.render().some(n=>n.props.role==="alert"&&n.props.children==="Upload failed"));
  h.button("Cancel").props.onClick();
  assert.equal(h.closed,1);assert.equal(h.calls.length,1);
});
