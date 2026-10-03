"use client";

import { useId } from "react";
import { CheckCircle2 } from "lucide-react";

export function ChoiceQuestion({ options, multiple = false, value, onChange, disabled = false, correctOptionIds }: {
  options: { id: string; text: string }[];
  multiple?: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  correctOptionIds?: string[];
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm text-slate-500">
        {multiple ? "Select all that apply. Select every correct option and no incorrect options to earn the mark." : "Select one answer."}
      </legend>
      {options.map(option => (
        <label key={option.id} className={`flex items-center gap-4 rounded-xl border p-4 transition sm:p-5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${correctOptionIds?.includes(option.id) ? "border-emerald-400 bg-emerald-50" : value.includes(option.id) ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-violet-300"}`}>
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            disabled={disabled}
            checked={value.includes(option.id)}
            onChange={() => {
              if (disabled) return;
              onChange(multiple ? value.includes(option.id) ? value.filter(id => id !== option.id) : [...value, option.id] : [option.id]);
            }}
            className="size-4 shrink-0 accent-violet-600"
          />
          <span className="text-sm font-bold text-slate-400">{option.id}</span>
          <span className="flex-1 text-sm leading-6 sm:text-base">{option.text}</span>
          {correctOptionIds?.includes(option.id) && <CheckCircle2 className="text-emerald-600" size={18} aria-label="Correct answer" />}
        </label>
      ))}
    </fieldset>
  );
}
