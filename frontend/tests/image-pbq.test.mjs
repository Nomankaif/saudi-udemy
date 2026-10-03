import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const hotspotModule = {exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/pbq-hotspots.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,hotspotModule);
const fieldsModule = {exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/pbq-fields.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,fieldsModule);
const area = kind => ({ id: kind, kind, label: kind, x: 25, y: 60, points: 1, evidence: "", caseSensitive: false, options: [{ id: "a", text: "Allow" }, { id: "b", text: "Deny" }] });
test("device hitboxes use configurable size, stay inside the image, and hide legacy location labels",()=>{
  const {hotspotBounds,elementName}=hotspotModule.exports;
  assert.deepEqual(JSON.parse(JSON.stringify(hotspotBounds({x:99,y:1,width:20,height:30}))),{left:80,top:0,width:20,height:30});
  assert.equal(elementName("Location 1"),"Diagram element");
  assert.equal(elementName("R1"),"R1");
});
function harness(file) {
  let cursor = 0;
  const state = [];
  const modules = {
    "react/jsx-runtime": jsx,
    react: { useId: () => "pbq-panel", useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => {state[i] = typeof v === "function" ? v(state[i]) : v;}]; } },
    "@/lib/pbq-hotspots": hotspotModule.exports,
    "@/lib/pbq-fields": fieldsModule.exports,
    "./pbq-form-editor": {PbqFormEditor:"form-editor",PbqFieldSettings:"field-settings"},
    "next/image": "img", "./question-content": { QuestionContent: "article" },
    "lucide-react": { Plus: "svg", Trash2: "svg", Upload: "svg" },
    "@/lib/api": { api: async () => ({url: "/uploads/media/test.png"}), messageOf: e => e.message },
    "./ui": { inputClass: "input", secondaryButton: "button" },
    "./pbq-image-cleaner": { PbqImageCleaner: "cleaner" }
  };
  const code = ts.transpileModule(readFileSync(new URL("../components/" + file + ".tsx", import.meta.url), "utf8"), {compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context = { exports: {}, crypto: {randomUUID}, window: {confirm: () => true}, require: name => {assert.ok(name in modules,name);return modules[name];} };
  vm.runInNewContext(code, context);
  function render(name, props) {
    cursor = 0;
    const found = [];
    function visit(n) {if (Array.isArray(n)) return n.forEach(visit);if (!n?.props) return;found.push(n);visit(n.props.children);}
    visit(context.exports[name](props));
    return found;
  }
  return {render, exports:context.exports};
}
test("PBQ hotspots use responsive coordinates; text answers persist while switching locations", () => {
  const h = harness("image-pbq");
  let value = [];
  const props = () => ({imageUrl:"/diagram.png", definition:{alt:"Network diagram",areas:[area("text"),area("select"),area("evidence")]}, value, onChange: next => {value=next;}});
  let tree=h.render("ImagePbq",props());
  const first=tree.find(n=>n.props["aria-label"]==="Open text");
  assert.equal(first.props.style.left,"21%");
  assert.equal(first.props.style.top,"53%");
  assert.equal(first.props.style.width,"8%");
  assert.equal(first.props.children,undefined);
  assert.equal(first.props["aria-expanded"],false);
  assert.ok(!tree.some(n=>n.type==="input"));
  assert.ok(!tree.some(n=>n.props["aria-label"]==="Answer location"));
  first.props.onClick();
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.type==="input").props.onChange({target:{value:"TLS"}});
  tree.find(n=>n.props["aria-label"]==="Open select").props.onClick();
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.type==="select" && !n.props["aria-label"]).props.onChange({target:{value:"b"}});
  tree.find(n=>n.props["aria-label"]==="Open text").props.onClick();
  tree=h.render("ImagePbq",props());
  assert.equal(tree.find(n=>n.type==="input").props.value,"TLS");
  assert.equal(value.length,2);
  tree.find(n=>n.props["aria-label"]==="Open evidence").props.onClick();
  tree=h.render("ImagePbq",props());
  assert.ok(!tree.some(n=>n.type==="input"));
});
test("PBQ checkbox, matching keyboard alternative, clear and disabled controls", () => {
  for (const kind of ["checkbox","radio","match"]) {
    const h=harness("image-pbq");
    let value=[];
    const props=()=>({imageUrl:"/diagram.png",definition:{alt:"Diagram",areas:[area(kind)]},value,onChange:next=>{value=next;}});
    let tree=h.render("ImagePbq",props());
    tree.find(n=>n.props["aria-label"]==="Open "+kind).props.onClick();
    tree=h.render("ImagePbq",props());
    if(kind==="match") {
      tree.find(n=>n.type==="button"&&n.props.children==="Allow").props.onClick();
      tree=h.render("ImagePbq",props());
      tree.find(n=>n.type==="button"&&n.props.children==="Place answer here").props.onClick();
    } else tree.find(n=>n.type==="input").props.onChange();
    assert.equal(value[0].values[0],"a");
    tree=h.render("ImagePbq",{...props(),disabled:true});
    assert.equal(tree.find(n=>n.type==="fieldset").props.disabled,true);
    tree.find(n=>n.type==="button"&&n.props.children==="Clear this answer").props.onClick();
    assert.equal(value.length,1);
    tree=h.render("ImagePbq",props());
    tree.find(n=>n.type==="button"&&n.props.children==="Clear this answer").props.onClick();
    assert.equal(value.length,0);
  }
});

const formArea = () => ({...area("form"), label:"Firewall", tabs:[{id:"p1",label:"Phase 1"},{id:"p2",label:"Phase 2"}], fields:[
  {...area("text"),id:"mode",label:"Mode",tabId:"p1"},
  {...area("select"),id:"protocol",label:"Protocol",tabId:"p2"},
  {...area("textarea"),id:"notes",label:"Notes",tabId:"p2"}
]});

test("student forms preserve independent answers across tabs and elements, reset only this element, and show optional question marks", () => {
  const h=harness("image-pbq"); let value=[];
  const props=()=>({imageUrl:"/diagram.png",definition:{alt:"Diagram",areas:[formArea(),{...area("text"),marker:"question"}]},value,onChange:next=>{value=next;}});
  let tree=h.render("ImagePbq",props());
  assert.equal(tree.find(n=>n.props["aria-label"]==="Open text").props.children.props.children,"?");
  tree.find(n=>n.props["aria-label"]==="Open Firewall").props.onClick();
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.type==="input").props.onChange({target:{value:"Tunnel"}});
  tree.find(n=>n.props.role==="tab"&&n.props.children==="Phase 2").props.onClick();
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.type==="select"&&!n.props["aria-label"]).props.onChange({target:{value:"a"}});
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.type==="textarea").props.onChange({target:{value:"First line\nSecond line"}});
  assert.equal(value.length,3);
  assert.equal(value.find(v=>v.fieldId==="mode").values[0],"Tunnel");
  tree=h.render("ImagePbq",props());
  tree.find(n=>n.props["aria-label"]==="Open text").props.onClick();
  tree=h.render("ImagePbq",props());tree.find(n=>n.type==="input").props.onChange({target:{value:"Database"}});
  tree.find(n=>n.props["aria-label"]==="Open Firewall").props.onClick();
  tree=h.render("ImagePbq",props());
  assert.equal(tree.find(n=>n.type==="input").props.value,"Tunnel");
  tree.find(n=>n.props.role==="tab"&&n.props.children==="Phase 2").props.onClick();
  tree=h.render("ImagePbq",props());
  assert.equal(tree.find(n=>n.type==="textarea").props.value,"First line\nSecond line");
  const locked=h.render("ImagePbq",{...props(),disabled:true});
  assert.equal(locked.find(n=>n.type==="fieldset").props.disabled,true);
  locked.find(n=>n.type==="textarea").props.onChange({target:{value:"Forbidden"}});
  assert.equal(value.find(v=>v.fieldId==="notes").values[0],"First line\nSecond line");
  tree.find(n=>n.props.children==="Reset this element").props.onClick();
  assert.equal(value.length,1);assert.equal(value[0].areaId,"text");
});

test("admin converts a single answer into a form without losing its key", () => {
  const h=harness("admin/pbq-editor");
  let q={imageUrl:"/diagram.png",pbq:{alt:"Diagram",areas:[area("text")]},pbqKey:[{areaId:"text",values:["Tunnel"],explanation:"feedback"}]};
  const props=()=>({question:q,onChange:next=>{q=next;},onUploading:()=>{}});
  h.render("PbqEditor",props()).find(n=>n.type==="select"&&n.props.value==="text").props.onChange({target:{value:"form"}});
  assert.equal(q.pbq.areas[0].fields.length,1);
  assert.equal(q.pbqKey[0].fieldId,q.pbq.areas[0].fields[0].id);
  assert.equal(q.pbqKey[0].values[0],"Tunnel");
  assert.equal(h.exports.pbqIssues(q).length,0);
});

test("matching selections are scoped to their form field and review keeps field keys separate", () => {
  const h=harness("image-pbq");let value=[];
  const a={...formArea(),tabs:[],fields:[{...area("match"),id:"first",label:"First"},{...area("match"),id:"second",label:"Second"}]};
  const props=()=>({imageUrl:"/diagram.png",definition:{alt:"Diagram",areas:[a]},value,onChange:next=>{value=next;}});
  let tree=h.render("ImagePbq",props());tree.find(n=>n.props["aria-label"]==="Open Firewall").props.onClick();
  tree=h.render("ImagePbq",props());tree.filter(n=>n.props.children==="Allow")[0].props.onClick();
  tree=h.render("ImagePbq",props());tree.filter(n=>n.props.children==="Place answer here")[1].props.onClick();
  assert.equal(value.length,0);
  tree.filter(n=>n.props.children==="Place answer here")[0].props.onClick();
  assert.equal(value[0].fieldId,"first");
  const review=h.render("PbqReview",{definition:props().definition,answers:value,expected:[{areaId:"form",fieldId:"first",values:["a"]},{areaId:"form",fieldId:"second",values:["b"]}],grades:[{areaId:"form",fieldId:"first",earned:1,maximum:1},{areaId:"form",fieldId:"second",earned:0,maximum:1}]});
  const paragraphs=review.filter(n=>n.type==="p");
  assert.ok(paragraphs[0].props.children.includes("Allow"));
  assert.ok(paragraphs[2].props.children.includes("Unanswered"));
  assert.ok(paragraphs[3].props.children.includes("Deny"));
});

test("form editor adds tabs and fields, removes fields with keys, and preserves fields when deleting a tab", () => {
  const h=harness("admin/pbq-form-editor");let a=formArea(),keys=[{areaId:"form",fieldId:"mode",values:["Tunnel"]}];
  const props=()=>({area:a,keys,onChange:(next,nextKeys)=>{a=next;keys=nextKeys;}});
  let tree=h.render("PbqFormEditor",props());
  tree.find(n=>n.props.children==="Add tab").props.onClick();assert.equal(a.tabs.length,3);
  tree=h.render("PbqFormEditor",props());
  tree.find(n=>Array.isArray(n.props.children)&&n.props.children.includes("Add field")).props.onClick();
  assert.equal(a.fields.length,4);assert.equal(a.fields[3].tabId,"p1");
  tree=h.render("PbqFormEditor",props());
  tree.find(n=>n.type==="input"&&n.props.placeholder).props.onChange({target:{value:"Hash algorithm"}});
  assert.equal(a.fields[3].label,"Hash algorithm");
  tree=h.render("PbqFormEditor",props());
  tree.find(n=>n.props["aria-label"]==="Remove tab Phase 1").props.onClick();
  assert.equal(a.fields[0].tabId,"p2");assert.equal(keys.length,1);
  tree=h.render("PbqFormEditor",props());
  tree.find(n=>Array.isArray(n.props.children)&&n.props.children.includes("Mode")).props.onClick();
  tree=h.render("PbqFormEditor",props());tree.find(n=>n.props["aria-label"]==="Delete selected field").props.onClick();
  assert.equal(a.fields.length,3);assert.equal(keys.length,0);
});

test("textarea answer keys preserve complete multiline alternatives", () => {
  const h=harness("admin/pbq-form-editor");let answerKey={areaId:"form",fieldId:"notes",values:[],explanation:""};
  const props=()=>({field:area("textarea"),answerKey,onField:()=>{},onKey:patch=>{answerKey={...answerKey,...patch};}});
  let tree=h.render("PbqFieldSettings",props());
  tree.find(n=>n.type==="textarea"&&n.props.rows===3).props.onChange({target:{value:"First\nSecond"}});
  assert.deepEqual([...answerKey.values],["First\nSecond"]);
  tree=h.render("PbqFieldSettings",props());tree.find(n=>n.props.children==="Add accepted response").props.onClick();
  assert.equal(answerKey.values.length,2);
  assert.equal(answerKey.values[0],"First\nSecond");
});
test("PBQ admin adds, positions and removes areas with their private keys", () => {
  const h=harness("admin/pbq-editor");
  let q={imageUrl:"/diagram.png",pbq:{alt:"Diagram",areas:[]},pbqKey:[]};
  const props=()=>({question:q,onChange:next=>{q=next;},onUploading:()=>{}});
  let tree=h.render("PbqEditor",props());
  tree.find(n=>n.type==="button"&&Array.isArray(n.props.children)&&n.props.children.includes("Add area")).props.onClick();
  assert.equal(q.pbq.areas.length,1);
  tree=h.render("PbqEditor",props());
  tree.find(n=>n.type==="div"&&n.props.className==="relative cursor-crosshair").props.onClick({clientX:150,clientY:125,currentTarget:{getBoundingClientRect:()=>({left:100,top:100,width:200,height:100})}});
  assert.equal(q.pbq.areas[0].x,25);
  assert.equal(q.pbq.areas[0].y,25);
  assert.equal(q.pbq.areas[0].width,8);
  assert.equal(q.pbq.areas[0].height,14);
  tree=h.render("PbqEditor",props());
  const width=tree.find(n=>n.type==="input"&&n.props.step===0.5&&n.props.value===8);
  width.props.onChange({target:{value:"16"}});
  assert.equal(q.pbq.areas[0].width,16);
  assert.ok(h.exports.pbqIssues(q).some(s=>s.includes("correct answer")));
  q.pbqKey=[{areaId:q.pbq.areas[0].id,values:["choice1"],explanation:"private"}];
  tree=h.render("PbqEditor",props());
  tree.find(n=>n.props["aria-label"]==="Delete selected area").props.onClick();
  assert.equal(q.pbq.areas.length,0);
  assert.equal(q.pbqKey.length,0);
});

test("PBQ cleaner locks question save, preserves hotspots, and changes the image only on apply", () => {
  const h = harness("admin/pbq-editor");
  let q = {imageUrl:"/uploads/media/original.png",pbq:{alt:"Diagram",areas:[area("text")]},pbqKey:[{areaId:"text",values:["TLS"]}]},busy=false;
  const props=()=>({question:q,onChange:next=>{q=next;},onUploading:value=>{busy=value;}});
  const open=()=>h.render("PbqEditor",props()).find(n=>n.type==="button"&&n.props.children==="Erase answer areas").props.onClick();
  open();assert.equal(busy,true);
  let modal=h.render("PbqEditor",props()).find(n=>n.type==="cleaner");
  modal.props.onClose();assert.equal(busy,false);assert.equal(q.imageUrl,"/uploads/media/original.png");
  open();modal=h.render("PbqEditor",props()).find(n=>n.type==="cleaner");
  modal.props.onApply("/uploads/media/cleaned.png");
  assert.equal(busy,false);assert.equal(q.imageUrl,"/uploads/media/cleaned.png");
  assert.equal(q.pbq.areas[0].x,25);assert.equal(q.pbqKey[0].values[0],"TLS");
  assert.ok(!h.render("PbqEditor",props()).some(n=>n.type==="cleaner"));
});

test("exam runner coalesces rapid PBQ typing and saves the latest full answer", async () => {
  const source = readFileSync(new URL("../components/exam-runner.tsx",import.meta.url),"utf8");
  const state=[], refs=[], effects=[], writes=[];
  let cursor=0, refCursor=0, first=true, release;
  const payload={attempt:{_id:"attempt",examTitle:"PBQ",mode:"PRACTICE",status:"IN_PROGRESS",questionCount:1,examId:"exam"},questions:[{_id:"q",type:"IMAGE_PBQ",text:"Diagram",options:[],displayOrder:1,topic:"Security",imageUrl:"/diagram.png",pbq:{alt:"Diagram",areas:[area("text")]}}],answers:[],progress:[{id:"q",order:1,number:1,answered:false,marked:false}],serverNow:new Date().toISOString()};
  const modules={
    "react/jsx-runtime":jsx,
    react:{
      useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==="function"?v(state[i]):v;}];},
      useRef(initial){const i=refCursor++;return refs[i] ||= {current:initial};},
      useCallback:fn=>fn, useEffect:fn=>{if(first)effects.push(fn);}
    },
    "next/link":"a", "next/image":"img", "next/navigation":{useRouter:()=>({push(){},replace(){}})},
    "lucide-react":new Proxy({}, {get:()=>"svg"}),
    "@/lib/api":{api:async(url,options)=>{if(!options)return payload;writes.push(JSON.parse(options.body));if(writes.length===1)await new Promise(resolve=>{release=resolve;});return{};},ApiError:class extends Error{},messageOf:e=>e.message},
    "./question-content":{QuestionContent:"article"}, "./access-requests":{RequestAccess:"aside"},
    "@/components/choice-question":{ChoiceQuestion:"choice"},
    "./drag-drop-question":{DragDropQuestion:"drag",DragDropReview:"drag-review"}, "./image-pbq":{ImagePbq:"pbq",PbqReview:"pbq-review"}
  };
  const context={exports:{},require:name=>{assert.ok(name in modules,name);return modules[name];},setTimeout,clearTimeout,window:{addEventListener(){},removeEventListener(){}},Date};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  function render(){cursor=0;refCursor=0;const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n?.props)return;found.push(n);visit(n.props.children);}visit(context.exports.ExamRunner({id:"attempt"}));first=false;return found;}
  render(); effects.forEach(fn=>fn());
  await new Promise(resolve=>setTimeout(resolve,10));
  const change=value=>render().find(n=>n.type==="pbq").props.onChange([{areaId:"text",values:[value]}]);
  change("T");await new Promise(resolve=>setTimeout(resolve,0));
  change("TL");change("TLS");
  assert.equal(writes.length,1);
  assert.equal(render().find(n=>n.type==="pbq").props.value[0].values[0],"TLS");
  release();await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(writes.length,2);
  assert.equal(writes[1].pbqAnswers[0].values[0],"TLS");
  assert.ok(render().some(n=>n.props.children==="All changes saved"));
});
