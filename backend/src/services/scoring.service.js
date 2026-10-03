import { gradePbq } from "./pbq.service.js";
import { placementKeys } from "./drag-drop.service.js";

export function scoreQuestions(questions, answers) {
  const answerMap = new Map(
    answers.map((answer) => [
      String(answer.attemptQuestionId),
      answer,
    ]),
  );
  let score = 0,
    maximumScore = 0,
    correctCount = 0,
    incorrectCount = 0,
    unansweredCount = 0;
  const topics = new Map();
  for (const question of questions) {
    const topic = question.topic || "General";
    const stats = topics.get(topic) || { topic, total: 0, correct: 0 };
    stats.total++;
    topics.set(topic, stats);
    maximumScore += question.marks;
    const answer = answerMap.get(String(question._id));
    if (question.type === "IMAGE_PBQ") {
      if (!answer?.pbqAnswers?.some(a => a.values?.length)) { unansweredCount++; continue; }
      const grade = gradePbq(question, answer.pbqAnswers);
      score += grade.earned;
      if (grade.passed) { correctCount++; stats.correct++; } else incorrectCount++;
      continue;
    }
    const selected = question.type === "DRAG_DROP" ? placementKeys(answer?.placements) : answer?.selectedOptionIds || [];
    if (!selected.length) {
      unansweredCount++;
      continue;
    }
    const expected = question.type === "DRAG_DROP" ? placementKeys(question.correctPlacements) : [...question.correctOptionIds].sort();
    const actual = [...selected].sort();
    if (
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index])
    ) {
      correctCount++;
      score += question.marks;
      stats.correct++;
    } else {
      incorrectCount++;
      score -= question.negativeMarks || 0;
    }
  }
  score = Math.max(0, score);
  return {
    score,
    maximumScore,
    correctCount,
    incorrectCount,
    unansweredCount,
    percentage: maximumScore
      ? Math.round((score / maximumScore) * 10000) / 100
      : 0,
    topicResults: [...topics.values()],
  };
}
