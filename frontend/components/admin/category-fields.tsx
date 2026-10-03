"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryOption } from "@/lib/types";
import { api, messageOf } from "@/lib/api";
import { inputClass } from "./ui";

export function useCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++version.current;
    try {
      const items = await api<CategoryOption[]>("/categories");
      if (request !== version.current) return;
      setCategories(items.map(item => ({ ...item, subcategories: item.subcategories || [] })));
      setError("");
    } catch (error) { if (request === version.current) setError(messageOf(error)); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { ++version.current; }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { clearTimeout(timer); invalidate(); window.removeEventListener("focus", focus); };
  }, [refresh, invalidate]);
  return { categories, loading, error, refresh };
}

export function CategoryFields({ category, subcategory, onChange, allowUnassigned = false, disabled = false }: {
  category: string; subcategory: string;
  onChange: (category: string, subcategory: string) => void;
  allowUnassigned?: boolean; disabled?: boolean;
}) {
  const { categories, loading, error, refresh } = useCategories();
  const selected = categories.find(item => item.name === category);
  const children = selected?.subcategories || [];
  return <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2">
    <label className="grid gap-2 text-sm font-medium">Category
      <select name="category" required disabled={disabled || loading} value={category} onChange={event => onChange(event.target.value, "")} className={`${inputClass} w-full rounded-lg`}>
        <option value="" disabled>{loading ? "Loading categories…" : "Select a category"}</option>
        {category && !selected && <option value={category}>{category}</option>}
        {categories.map(item => <option key={item.name}>{item.name}</option>)}
      </select>
    </label>
    <label className="grid gap-2 text-sm font-medium">Subcategory
      <select name="subcategory" required={children.length > 0 && !allowUnassigned} disabled={disabled || loading || !category || !children.length} value={subcategory} onChange={event => onChange(category, event.target.value)} className={`${inputClass} w-full rounded-lg disabled:bg-slate-50 disabled:text-slate-500`}>
        <option value="">{!category ? "Select a category first" : loading ? "Loading subcategories…" : children.length ? allowUnassigned ? "Not assigned" : "Select a subcategory" : "No subcategories available"}</option>
        {subcategory && !children.some(item => item.name === subcategory) && <option value={subcategory}>{subcategory}</option>}
        {children.map(item => <option key={item.name}>{item.name}</option>)}
      </select>
    </label>
    {!loading && !error && category && !children.length && <p className="text-xs text-slate-500 sm:col-span-2">Subcategories can be added under this category in Categories &amp; subcategories.</p>}
    {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2">Could not load categories: {error} <button type="button" className="underline" onClick={() => void refresh()}>Retry</button></p>}
  </div>;
}
