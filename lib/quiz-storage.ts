import { isQuizVariantId, type QuizAnswer, type QuizProgress } from "./quiz";

const STORAGE_KEY = "next-quiz-progress-v1";

export function loadStoredProgress(): QuizProgress | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawProgress = window.localStorage.getItem(STORAGE_KEY);

    if (!rawProgress) {
      return null;
    }

    const parsedProgress: unknown = JSON.parse(rawProgress);

    if (!isStoredProgress(parsedProgress)) {
      clearStoredProgress();
      return null;
    }

    return parsedProgress;
  } catch {
    clearStoredProgress();
    return null;
  }
}

export function saveStoredProgress(progress: QuizProgress): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable in private modes or when quota is exceeded.
  }
}

export function clearStoredProgress(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No recovery needed; the app can continue without persisted progress.
  }
}

function isStoredProgress(value: unknown): value is QuizProgress {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    isQuizVariantId(value.variantId) &&
    Array.isArray(value.questionOrder) &&
    value.questionOrder.every(Number.isInteger) &&
    Number.isInteger(value.currentIndex) &&
    Array.isArray(value.answers) &&
    value.answers.every(isStoredAnswer) &&
    typeof value.elapsedSeconds === "number" &&
    typeof value.startedAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isStoredAnswer(value: unknown): value is QuizAnswer {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.questionIndex) &&
    Number.isInteger(value.optionIndex) &&
    typeof value.selectedAnswer === "string" &&
    typeof value.correctAnswer === "string" &&
    typeof value.isCorrect === "boolean" &&
    typeof value.answeredAt === "number"
  );
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && "localStorage" in window;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
