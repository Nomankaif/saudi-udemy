export function bulkImportIssues(candidates, label, confirmReview, getIssues) {
  return candidates.flatMap(candidate => [
    ...(!candidate.reviewed && !confirmReview
      ? [`${label} ${candidate.sourceNumber}: confirm bulk source review or review and save it first`]
      : []),
    ...getIssues(candidate).map(issue => `${label} ${candidate.sourceNumber}: ${issue}`),
  ]);
}
