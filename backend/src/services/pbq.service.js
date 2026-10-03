import { ApiError } from "../utils/api-error.js";

const fieldKinds = ["text", "textarea", "select", "radio", "checkbox", "match"];
const idOk = id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const str = v => typeof v === "string" ? v.trim() : "";
const textKind = kind => kind === "text" || kind === "textarea";
const identity = (areaId, fieldId) => areaId + ":" + (fieldId ?? "");
const same = (entry, ref) => entry.areaId === ref.area.id && entry.fieldId === ref.fieldId;

// Legacy single-answer areas and new form fields share the same grading pipeline.
export function pbqFields(definition) {
  return (definition?.areas || []).flatMap(area => area.kind === "form"
    ? (area.fields || []).map(field => ({ area, field, fieldId: field.id }))
    : area.kind === "evidence" ? [] : [{ area, field: area }]);
}

function normalizeField(field) {
  if (!field || !Array.isArray(field.options) || field.options.length > 30) throw new ApiError(400, "PBQ: each field supports up to 30 choices.");
  const result = { id: str(field.id), label: str(field.label), kind: str(field.kind),
    points: ["evidence", "form"].includes(field.kind) ? 0 : Number(field.points ?? 1), caseSensitive: field.caseSensitive === true,
    evidence: str(field.evidence), options: field.options.map(o => ({ id: str(o?.id), text: str(o?.text) })) };
  if (result.label.length > 200 || result.evidence.length > 20000 || result.options.some(o => o.text.length > 500)) throw new ApiError(400, "PBQ: shorten labels, evidence or choices.");
  return result;
}

export function normalizePbq(input, key) {
  if (!input || !Array.isArray(input.areas) || input.areas.length > 40 || !Array.isArray(key) || key.length > 200)
    throw new ApiError(400, "PBQ: use up to 40 image areas and 200 answer fields in total.");
  const areas = input.areas.map(a => {
    const result = { ...normalizeField(a), x: Number(a.x), y: Number(a.y), width: Number(a.width ?? 8), height: Number(a.height ?? 14), marker: a.marker == null ? "none" : str(a.marker) };
    if (a.kind === "form") {
      if (!Array.isArray(a.fields) || a.fields.length > 20 || !Array.isArray(a.tabs || []) || (a.tabs || []).length > 8) throw new ApiError(400, "PBQ: a form supports up to 20 fields and 8 tabs.");
      result.fields = a.fields.map(f => ({ ...normalizeField(f), ...(f.tabId != null ? { tabId: str(f.tabId) } : {}) }));
      result.tabs = (a.tabs || []).map(t => ({ id: str(t?.id), label: str(t?.label) }));
      if (result.tabs.some(t => t.label.length > 80)) throw new ApiError(400, "PBQ: tab names must be 80 characters or fewer.");
    }
    return result;
  });
  const pbq = { alt: str(input.alt).slice(0, 1000), areas };
  if (pbqFields(pbq).length > 200) throw new ApiError(400, "PBQ: use at most 200 answer fields in total.");
  const pbqKey = key.map(k => {
    if (!k || !Array.isArray(k.values) || k.values.length > 30 || k.values.some(v => typeof v !== "string" || v.length > 500)) throw new ApiError(400, "PBQ: answer values must be text, up to 500 characters each.");
    if (str(k.explanation).length > 5000) throw new ApiError(400, "PBQ: feedback must be 5,000 characters or fewer.");
    return { areaId: str(k.areaId), ...(k.fieldId != null ? { fieldId: str(k.fieldId) } : {}), values: k.values.map(str), explanation: str(k.explanation) };
  });
  return { pbq, pbqKey };
}

export function pbqErrors(q) {
  const errors = [], areas = q.pbq?.areas || [], keys = q.pbqKey || [], fields = pbqFields(q.pbq);
  if (!q.imageUrl) errors.push("PBQ: upload the question diagram.");
  if (!q.pbq?.alt?.trim()) errors.push("PBQ: add a diagram description for accessibility.");
  if (!areas.length || areas.length > 40 || !fields.length) errors.push("PBQ: add at least one answer area (maximum 40 areas).");
  if (fields.length > 200) errors.push("PBQ: use at most 200 answer fields in total.");
  areas.forEach((a, i) => {
    const name = "PBQ area " + (i + 1) + (a.label ? " (" + a.label + ")" : "");
    if (!idOk(a.id) || areas.findIndex(b => b.id === a.id) !== i) errors.push(name + ": invalid or duplicate identifier; remove and recreate this area.");
    if (!a.label?.trim()) errors.push(name + ": enter a label.");
    if (![...fieldKinds, "evidence", "form"].includes(a.kind)) errors.push(name + ": choose a supported interaction.");
    if (!["none", "question"].includes(a.marker ?? "none")) errors.push(name + ": choose a supported marker.");
    if (![a.x, a.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) errors.push(name + ": position must be within the image (0–100%).");
    if (![a.width ?? 8, a.height ?? 14].every(n => Number.isFinite(n) && n >= 1 && n <= 100)) errors.push(name + ": clickable width and height must be between 1 and 100%.");
    if (a.kind === "evidence") {
      if (!a.evidence?.trim()) errors.push(name + ": enter evidence or logs.");
      if (keys.some(k => k.areaId === a.id)) errors.push(name + ": evidence-only areas cannot have an answer key.");
    }
    if (a.kind === "form") {
      if (!a.fields?.length || a.fields.length > 20) errors.push(name + ": add 1–20 form fields.");
      const tabs = a.tabs || [];
      if (tabs.length > 8 || tabs.some((t, n) => !idOk(t.id) || !t.label?.trim() || tabs.findIndex(b => b.id === t.id) !== n)) errors.push(name + ": use up to 8 tabs with unique identifiers and non-empty names.");
      (a.fields || []).forEach((f, n) => {
        if (!idOk(f.id) || a.fields.findIndex(b => b.id === f.id) !== n) errors.push(name + ": field " + (n + 1) + " has an invalid or duplicate identifier.");
        if (!f.label?.trim()) errors.push(name + ": field " + (n + 1) + " needs a label.");
        if (!fieldKinds.includes(f.kind)) errors.push(name + " / " + f.label + ": choose a supported field type.");
        if (tabs.length ? !tabs.some(t => t.id === f.tabId) : Boolean(f.tabId)) errors.push(name + " / " + f.label + ": assign the field to an existing tab.");
      });
      tabs.forEach(t => { if (!a.fields?.some(f => f.tabId === t.id)) errors.push(name + ": tab " + t.label + " needs at least one field."); });
    }
  });
  fields.forEach(ref => {
    const { area, field: f, fieldId } = ref;
    const name = "PBQ area " + (areas.indexOf(area) + 1) + " (" + area.label + ")" + (fieldId ? " / " + (f.label || "Unnamed field") : "");
    const key = keys.filter(k => same(k, ref));
    if (!Number.isInteger(f.points) || f.points < 1 || f.points > 100) errors.push(name + ": set points to a whole number from 1 to 100.");
    if (key.length !== 1 || !key[0].values?.length || key[0].values.some(v => !v.trim())) errors.push(name + ": configure a non-empty correct answer.");
    if (!textKind(f.kind)) {
      if (f.options.length < 2) errors.push(name + ": add at least two choices.");
      if (f.options.some((o, n) => !idOk(o.id) || !o.text?.trim() || f.options.findIndex(b => b.id === o.id) !== n)) errors.push(name + ": choices need unique identifiers and non-empty labels.");
      if (key[0]?.values.some(v => !f.options.some(o => o.id === v))) errors.push(name + ": correct answer must reference an existing choice.");
      if (f.kind !== "checkbox" && key[0]?.values.length !== 1) errors.push(name + ": select exactly one correct choice.");
    }
    if (key[0] && new Set(key[0].values).size !== key[0].values.length) errors.push(name + ": remove duplicate correct answers.");
  });
  if (keys.some(k => !fields.some(ref => same(k, ref)))) errors.push("PBQ: remove answer keys for deleted areas or fields.");
  return errors;
}

export function validatePbqAnswers(question, input) {
  if (!Array.isArray(input) || input.length > 200) throw new ApiError(400, "PBQ: invalid answer list.");
  const seen = new Set(), fields = pbqFields(question.pbq);
  return input.map(entry => {
    const ref = entry && fields.find(ref => same(entry, ref));
    const token = ref && identity(ref.area.id, ref.fieldId);
    if (!ref || seen.has(token)) throw new ApiError(400, "PBQ: unknown, duplicate, or evidence-only answer area / field.");
    seen.add(token);
    const { area, field: f, fieldId } = ref, values = entry.values;
    if (!Array.isArray(values) || values.length > (f.kind === "checkbox" ? 30 : 1) || values.some(v => typeof v !== "string" || v.length > 500) || new Set(values).size !== values.length)
      throw new ApiError(400, "PBQ " + area.label + " / " + f.label + ": invalid answer values.");
    if (!textKind(f.kind) && values.some(v => !f.options.some(o => o.id === v))) throw new ApiError(400, "PBQ " + area.label + " / " + f.label + ": choose an available option.");
    return { areaId: area.id, ...(fieldId ? { fieldId } : {}), values: values.map(v => v.trim()).filter(Boolean) };
  }).filter(a => a.values.length);
}

export function gradePbq(question, input = []) {
  const items = pbqFields(question.pbq).map(ref => {
    const { area, field: f, fieldId } = ref;
    const expected = question.pbqKey?.find(k => same(k, ref))?.values || [];
    const actual = input.find(v => same(v, ref))?.values || [];
    const clean = s => { const text = s.trim().replace(/\r\n?/g, "\n"); return f.caseSensitive ? text : text.toLowerCase(); };
    const passed = textKind(f.kind) ? actual.length === 1 && expected.some(v => clean(v) === clean(actual[0])) : expected.length > 0 && actual.length === expected.length && expected.every(v => actual.includes(v));
    return { areaId: area.id, ...(fieldId ? { fieldId } : {}), passed, earned: passed ? f.points : 0, maximum: f.points };
  });
  return { items, earned: items.reduce((n, i) => n + i.earned, 0), maximum: items.reduce((n, i) => n + i.maximum, 0), passed: items.length > 0 && items.every(i => i.passed) };
}
