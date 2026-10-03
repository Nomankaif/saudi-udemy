import type { PbqArea, PbqDefinition, PbqField } from "./types";

export const isTextField = (kind: string) => kind === "text" || kind === "textarea";

type FieldRef = { area: PbqArea; field: (PbqField | PbqArea) & { tabId?: string }; fieldId?: string };
export function pbqFields(definition?: PbqDefinition): FieldRef[] {
  return (definition?.areas || []).flatMap<FieldRef>(area => area.kind === "form"
    ? (area.fields || []).map(field => ({ area, field, fieldId: field.id }))
    : area.kind === "evidence" ? [] : [{ area, field: area }]);
}
