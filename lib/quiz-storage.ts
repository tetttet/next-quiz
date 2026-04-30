import {
  isQuizVariantId,
  type QuizAnswer,
  type QuizProgress,
  type QuizVariantId,
} from "./quiz";

const STORAGE_KEY = "next-quiz-progress-v1";
const LAST_QUESTION_ORDERS_KEY = "next-quiz-last-question-orders-v1";

type StoredQuestionOrders = Partial<Record<QuizVariantId, number[]>>;

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

export function loadLastQuestionOrder(
  variantId: QuizVariantId,
  questionCount: number,
): number[] | null {
  const questionOrders = loadStoredQuestionOrders();
  const questionOrder = questionOrders?.[variantId];

  if (!isQuestionOrderForCount(questionOrder, questionCount)) {
    return null;
  }

  return questionOrder;
}

export function saveLastQuestionOrder(
  variantId: QuizVariantId,
  questionOrder: number[],
): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    const questionOrders = loadStoredQuestionOrders() ?? {};
    questionOrders[variantId] = questionOrder;
    window.localStorage.setItem(
      LAST_QUESTION_ORDERS_KEY,
      JSON.stringify(questionOrders),
    );
  } catch {
    // Losing the last order only means the next quiz may fall back to random.
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

function loadStoredQuestionOrders(): StoredQuestionOrders | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const rawQuestionOrders = window.localStorage.getItem(
      LAST_QUESTION_ORDERS_KEY,
    );

    if (!rawQuestionOrders) {
      return null;
    }

    const parsedQuestionOrders: unknown = JSON.parse(rawQuestionOrders);

    if (!isStoredQuestionOrders(parsedQuestionOrders)) {
      clearStoredQuestionOrders();
      return null;
    }

    return parsedQuestionOrders;
  } catch {
    clearStoredQuestionOrders();
    return null;
  }
}

function clearStoredQuestionOrders(): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(LAST_QUESTION_ORDERS_KEY);
  } catch {
    // No recovery needed; the app can continue without persisted last orders.
  }
}

function isStoredQuestionOrders(value: unknown): value is StoredQuestionOrders {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([variantId, questionOrder]) =>
      isQuizVariantId(variantId) &&
      Array.isArray(questionOrder) &&
      questionOrder.every(Number.isInteger),
  );
}

function isQuestionOrderForCount(
  questionOrder: unknown,
  questionCount: number,
): questionOrder is number[] {
  if (!Array.isArray(questionOrder) || questionOrder.length !== questionCount) {
    return false;
  }

  const seenQuestionIndexes = new Set<number>();

  return questionOrder.every((questionIndex) => {
    if (
      !Number.isInteger(questionIndex) ||
      questionIndex < 0 ||
      questionIndex >= questionCount ||
      seenQuestionIndexes.has(questionIndex)
    ) {
      return false;
    }

    seenQuestionIndexes.add(questionIndex);
    return true;
  });
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
