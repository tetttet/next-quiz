export type QuizVariantId = "1" | "2" | "3" | "4";

export type QuizQuestion = {
  question_number: number | string;
  question_text: string;
  options: string[];
  correct_answer: string;
  reference?: string;
};

export type QuizVariant = {
  id: QuizVariantId;
  title: string;
  fileName: string;
  questions: QuizQuestion[];
};

export type QuizAnswer = {
  questionIndex: number;
  optionIndex: number;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  answeredAt: number;
};

export type QuizProgress = {
  version: 2;
  variantId: QuizVariantId;
  questionOrder: number[];
  optionOrders: number[][];
  currentIndex: number;
  answers: QuizAnswer[];
  elapsedSeconds: number;
  startedAt: number;
  updatedAt: number;
};

export type QuizResultSummary = {
  correctCount: number;
  incorrectCount: number;
  percent: number;
};

const QUIZ_VARIANT_IDS = ["1", "2", "3", "4"] as const;

export function isQuizVariantId(value: unknown): value is QuizVariantId {
  return (
    typeof value === "string" &&
    QUIZ_VARIANT_IDS.includes(value as QuizVariantId)
  );
}

export function validateQuestions(value: unknown): value is QuizQuestion[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((question) => {
      if (!isRecord(question)) {
        return false;
      }

      return (
        (typeof question.question_number === "number" ||
          typeof question.question_number === "string") &&
        typeof question.question_text === "string" &&
        Array.isArray(question.options) &&
        question.options.length > 1 &&
        question.options.every((option) => typeof option === "string") &&
        typeof question.correct_answer === "string" &&
        (question.reference === undefined ||
          typeof question.reference === "string")
      );
    })
  );
}

export function createShuffledQuestionOrder(
  questionCount: number,
  previousOrder?: number[],
): number[] {
  const order = Array.from({ length: questionCount }, (_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  if (questionCount > 1 && isSameQuestionOrder(order, previousOrder)) {
    order.push(order.shift() ?? 0);
  }

  return order;
}

export function createShuffledOptionOrder(
  optionCount: number,
  correctOptionIndex?: number,
): number[] {
  const order = createSequentialOrder(optionCount);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  if (optionCount > 1 && isSequentialOrder(order)) {
    order.push(order.shift() ?? 0);
  }

  if (
    correctOptionIndex !== undefined &&
    correctOptionIndex >= 0 &&
    correctOptionIndex < optionCount &&
    optionCount > 1 &&
    order[correctOptionIndex] === correctOptionIndex
  ) {
    const swapIndex =
      (correctOptionIndex + 1 + Math.floor(Math.random() * (optionCount - 1))) %
      optionCount;
    [order[correctOptionIndex], order[swapIndex]] = [
      order[swapIndex],
      order[correctOptionIndex],
    ];
  }

  return order;
}

export function createInitialProgress(
  variantId: QuizVariantId,
  questions: QuizQuestion[],
  previousQuestionOrder?: number[],
): QuizProgress {
  const now = Date.now();
  const questionCount = questions.length;

  return {
    version: 2,
    variantId,
    questionOrder: createShuffledQuestionOrder(
      questionCount,
      previousQuestionOrder,
    ),
    optionOrders: questions.map((question) =>
      createShuffledOptionOrder(
        question.options.length,
        getCorrectOptionIndex(question),
      ),
    ),
    currentIndex: 0,
    answers: [],
    elapsedSeconds: 0,
    startedAt: now,
    updatedAt: now,
  };
}

export function getOptionOrderForQuestion(
  progress: QuizProgress,
  question: QuizQuestion,
  questionIndex: number,
): number[] {
  const optionOrder = progress.optionOrders[questionIndex];

  if (isOptionOrderForCount(optionOrder, question.options.length)) {
    return optionOrder;
  }

  return createSequentialOrder(question.options.length);
}

export function getAnswerForQuestion(
  progress: QuizProgress,
  questionIndex: number,
): QuizAnswer | undefined {
  return progress.answers.find(
    (answer) => answer.questionIndex === questionIndex,
  );
}

export function evaluateAnswer(
  question: QuizQuestion,
  questionIndex: number,
  optionIndex: number,
): QuizAnswer {
  const selectedAnswer = question.options[optionIndex] ?? "";

  return {
    questionIndex,
    optionIndex,
    selectedAnswer,
    correctAnswer: question.correct_answer,
    isCorrect: isSameAnswer(selectedAnswer, question.correct_answer),
    answeredAt: Date.now(),
  };
}

export function getCorrectOptionIndex(question: QuizQuestion): number {
  const exactIndex = question.options.indexOf(question.correct_answer);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  return question.options.findIndex((option) =>
    isSameAnswer(option, question.correct_answer),
  );
}

export function isProgressCompatible(
  progress: QuizProgress,
  questions: QuizQuestion[],
): boolean {
  const questionCount = questions.length;

  if (
    questionCount <= 0 ||
    progress.questionOrder.length !== questionCount ||
    progress.optionOrders.length !== questionCount ||
    !Number.isInteger(progress.currentIndex) ||
    progress.currentIndex < 0 ||
    progress.currentIndex >= questionCount ||
    progress.elapsedSeconds < 0
  ) {
    return false;
  }

  const seenQuestionIndexes = new Set<number>();
  const hasValidOrder = progress.questionOrder.every((questionIndex) => {
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

  if (!hasValidOrder) {
    return false;
  }

  const hasValidOptionOrders = progress.optionOrders.every(
    (optionOrder, questionIndex) =>
      isOptionOrderForCount(
        optionOrder,
        questions[questionIndex]?.options.length ?? 0,
      ),
  );

  if (!hasValidOptionOrders) {
    return false;
  }

  const answeredQuestions = new Set<number>();

  return progress.answers.every((answer) => {
    const optionCount = questions[answer.questionIndex]?.options.length ?? 0;
    const isValid =
      Number.isInteger(answer.questionIndex) &&
      answer.questionIndex >= 0 &&
      answer.questionIndex < questionCount &&
      Number.isInteger(answer.optionIndex) &&
      answer.optionIndex >= 0 &&
      answer.optionIndex < optionCount &&
      typeof answer.selectedAnswer === "string" &&
      typeof answer.correctAnswer === "string" &&
      typeof answer.isCorrect === "boolean" &&
      typeof answer.answeredAt === "number" &&
      !answeredQuestions.has(answer.questionIndex);

    answeredQuestions.add(answer.questionIndex);
    return isValid;
  });
}

export function getResultSummary(
  answers: QuizAnswer[],
  questionCount: number,
): QuizResultSummary {
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const incorrectCount = Math.max(questionCount - correctCount, 0);
  const percent =
    questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;

  return {
    correctCount,
    incorrectCount,
    percent,
  };
}

export function getResultMessage(percent: number): string {
  if (percent >= 85) {
    return "Отличный результат";
  }

  if (percent >= 65) {
    return "Хороший результат";
  }

  return "Нужно повторить материал";
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(Math.floor(totalSeconds), 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function isSameAnswer(option: string, correctAnswer: string): boolean {
  return (
    option === correctAnswer ||
    normalizeAnswer(option) === normalizeAnswer(correctAnswer)
  );
}

function normalizeAnswer(answer: string): string {
  return answer
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;.:]+$/u, "")
    .trim()
    .toLocaleLowerCase("ru-RU");
}

function isSameQuestionOrder(order: number[], previousOrder?: number[]): boolean {
  return (
    previousOrder !== undefined &&
    order.length === previousOrder.length &&
    order.every((questionIndex, index) => questionIndex === previousOrder[index])
  );
}

function createSequentialOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function isSequentialOrder(order: number[]): boolean {
  return order.every((item, index) => item === index);
}

function isOptionOrderForCount(
  optionOrder: unknown,
  optionCount: number,
): optionOrder is number[] {
  if (!Array.isArray(optionOrder) || optionOrder.length !== optionCount) {
    return false;
  }

  const seenOptionIndexes = new Set<number>();

  return optionOrder.every((optionIndex) => {
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= optionCount ||
      seenOptionIndexes.has(optionIndex)
    ) {
      return false;
    }

    seenOptionIndexes.add(optionIndex);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
