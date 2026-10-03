"use client";
import { useState } from "react";

export function CatalogCategoryFields({ items, initialCategory, initialSubcategory, fieldClass }: {
  items: { category: string; subcategory?: string }[];
  initialCategory: string; initialSubcategory: string; fieldClass: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const categories = [...new Set(items.map(item => item.category))].sort();
  const children = [...new Set(items.filter(item => item.category === category).map(item => item.subcategory).filter((value): value is string => Boolean(value)))].sort();
  return <>
    <label className="text-xs font-semibold text-slate-600">Category<select name="category" value={category} onChange={event => { setCategory(event.target.value); setSubcategory(""); }} className={fieldClass}><option value="">All categories</option>{category && !categories.includes(category) && <option>{category}</option>}{categories.map(item => <option key={item}>{item}</option>)}</select></label>
    <label className="text-xs font-semibold text-slate-600">Subcategory<select name="subcategory" value={subcategory} disabled={!category} onChange={event => setSubcategory(event.target.value)} className={`${fieldClass} disabled:bg-slate-50 disabled:text-slate-400`}><option value="">{category ? "All subcategories" : "Select a category first"}</option>{subcategory && !children.includes(subcategory) && <option>{subcategory}</option>}{children.map(item => <option key={item}>{item}</option>)}</select></label>
  </>;
}
