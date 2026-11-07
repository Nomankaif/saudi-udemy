"use client";

type Option = { value: string; label: string };

export function ImportReviewControls({
  total, validCount, cleanCount, onSelectAll, onSelectClean, onClear,
  search, onSearch, reviewStatus, onReviewStatus, reviewOptions,
  answerStatus, onAnswerStatus, answerOptions, visibleCount, selectionHelp, answerHelp,
}: {
  total: number;
  validCount: number;
  cleanCount: number;
  onSelectAll: () => void;
  onSelectClean: () => void;
  onClear: () => void;
  search: string;
  onSearch: (value: string) => void;
  reviewStatus: string;
  onReviewStatus: (value: string) => void;
  reviewOptions: Option[];
  answerStatus: string;
  onAnswerStatus: (value: string) => void;
  answerOptions: Option[];
  visibleCount: number;
  selectionHelp: string;
  answerHelp: string;
}) {
  const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50";
  const fieldClass = "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-violet-600";
  return <>
    <div className="mt-5 border-y border-slate-200 py-4">
      <p className="text-sm font-semibold text-slate-900">Choose what to import</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={onSelectAll}>Select all valid {validCount}</button>
        <button type="button" className={buttonClass} onClick={onSelectClean}>Select clean {cleanCount}</button>
        <button type="button" className="px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={onClear}>Unselect all</button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{selectionHelp}</p>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Find question
        <input aria-label="Search imported questions" value={search} onChange={event => onSearch(event.target.value)} placeholder="Text or source number" className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Review status
        <select aria-label="Filter review status" value={reviewStatus} onChange={event => onReviewStatus(event.target.value)} className={fieldClass}>
          {reviewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Answer key
        <select aria-label="Filter answer key" value={answerStatus} onChange={event => onAnswerStatus(event.target.value)} className={fieldClass}>
          {answerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <p className="mt-3 text-sm text-slate-600">Showing {visibleCount} of {total} questions · Importable matches are selected automatically when filters change.</p>
    <p className="mt-2 text-xs text-slate-500">{answerHelp}</p>
  </>;
}
