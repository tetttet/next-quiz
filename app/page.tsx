"use client";

import { useEffect, useState } from "react";
import variantOneQuestions from "@/constants/1.json";
import variantTwoQuestions from "@/constants/2.json";
import variantThreeQuestions from "@/constants/3.json";
import variantFourQuestions from "@/constants/4.json";
import {
  createInitialProgress,
  evaluateAnswer,
  formatDuration,
  getAnswerForQuestion,
  getCorrectOptionIndex,
  getResultMessage,
  getResultSummary,
  isProgressCompatible,
  type QuizAnswer,
  type QuizProgress,
  type QuizQuestion,
  type QuizVariant,
  type QuizVariantId,
  validateQuestions,
} from "@/lib/quiz";
import {
  clearStoredProgress,
  loadLastQuestionOrder,
  loadStoredProgress,
  saveLastQuestionOrder,
  saveStoredProgress,
} from "@/lib/quiz-storage";

type LoadedQuizVariant = QuizVariant & {
  isValid: boolean;
};

type Screen = "start" | "quiz" | "result" | "error";

const rawQuizVariants: Array<
  Omit<QuizVariant, "questions"> & { questions: unknown }
> = [
  {
    id: "1",
    title: "Вариант 1",
    fileName: "1.json",
    questions: variantOneQuestions,
  },
  {
    id: "2",
    title: "Вариант 2",
    fileName: "2.json",
    questions: variantTwoQuestions,
  },
  {
    id: "3",
    title: "Вариант 3",
    fileName: "3.json",
    questions: variantThreeQuestions,
  },
  {
    id: "4",
    title: "Вариант 4",
    fileName: "4.json",
    questions: variantFourQuestions,
  },
];

const quizVariants: LoadedQuizVariant[] = rawQuizVariants.map((variant) => {
  if (validateQuestions(variant.questions)) {
    return {
      id: variant.id,
      title: variant.title,
      fileName: variant.fileName,
      questions: variant.questions,
      isValid: true,
    };
  }

  return {
    id: variant.id,
    title: variant.title,
    fileName: variant.fileName,
    questions: [],
    isValid: false,
  };
});

const primaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-[14px] font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:w-auto";

const secondaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("start");
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [savedProgress, setSavedProgress] = useState<QuizProgress | null>(
    null,
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeProgressVariantId = progress?.variantId;

  useEffect(() => {
    const restoreTimerId = window.setTimeout(() => {
      const storedProgress = loadStoredProgress();

      if (storedProgress) {
        const storedVariant = getVariantById(storedProgress.variantId);

        if (
          storedVariant?.isValid &&
          isProgressCompatible(storedProgress, storedVariant.questions.length)
        ) {
          setSavedProgress(storedProgress);
        } else {
          clearStoredProgress();
        }
      }

      setIsHydrated(true);
    }, 0);

    return () => window.clearTimeout(restoreTimerId);
  }, []);

  useEffect(() => {
    if (screen !== "quiz" || !activeProgressVariantId) {
      return;
    }

    const timerId = window.setInterval(() => {
      setProgress((currentProgress) => {
        if (
          !currentProgress ||
          currentProgress.variantId !== activeProgressVariantId
        ) {
          return currentProgress;
        }

        return {
          ...currentProgress,
          elapsedSeconds: currentProgress.elapsedSeconds + 1,
          updatedAt: Date.now(),
        };
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [activeProgressVariantId, screen]);

  useEffect(() => {
    if (!isHydrated || screen !== "quiz" || !progress) {
      return;
    }

    saveStoredProgress(progress);
  }, [isHydrated, progress, screen]);

  const activeVariant = activeProgressVariantId
    ? getVariantById(activeProgressVariantId)
    : undefined;
  const currentQuestionIndex = progress?.questionOrder[progress.currentIndex];
  const currentQuestion =
    activeVariant && currentQuestionIndex !== undefined
      ? activeVariant.questions[currentQuestionIndex]
      : undefined;
  const currentAnswer =
    progress && currentQuestionIndex !== undefined
      ? getAnswerForQuestion(progress, currentQuestionIndex)
      : undefined;

  function handleStartVariant(variantId: QuizVariantId) {
    const variant = getVariantById(variantId);

    if (!variant?.isValid || variant.questions.length === 0) {
      setErrorMessage(
        `Файл ${variant?.fileName ?? "JSON"} не загрузился или имеет неожиданную структуру.`,
      );
      setScreen("error");
      return;
    }

    const lastQuestionOrder = loadLastQuestionOrder(
      variant.id,
      variant.questions.length,
    );
    const nextProgress = createInitialProgress(
      variant.id,
      variant.questions.length,
      lastQuestionOrder ?? undefined,
    );

    clearStoredProgress();
    saveLastQuestionOrder(variant.id, nextProgress.questionOrder);
    saveStoredProgress(nextProgress);
    setSavedProgress(null);
    setProgress(nextProgress);
    setErrorMessage(null);
    setScreen("quiz");
  }

  function handleResume() {
    if (!savedProgress) {
      return;
    }

    const variant = getVariantById(savedProgress.variantId);

    if (
      !variant?.isValid ||
      !isProgressCompatible(savedProgress, variant.questions.length)
    ) {
      clearStoredProgress();
      setSavedProgress(null);
      setErrorMessage(
        "Сохраненный прогресс устарел или не совпадает с текущими данными теста.",
      );
      setScreen("error");
      return;
    }

    setProgress(savedProgress);
    setErrorMessage(null);
    setScreen("quiz");
  }

  function handleRestartSaved() {
    if (!savedProgress) {
      return;
    }

    handleStartVariant(savedProgress.variantId);
  }

  function handleSelectAnswer(optionIndex: number) {
    setProgress((currentProgress) => {
      if (!currentProgress) {
        return currentProgress;
      }

      const variant = getVariantById(currentProgress.variantId);
      const questionIndex =
        currentProgress.questionOrder[currentProgress.currentIndex];
      const question = variant?.questions[questionIndex];

      if (
        !variant?.isValid ||
        !question ||
        getAnswerForQuestion(currentProgress, questionIndex) ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return currentProgress;
      }

      return {
        ...currentProgress,
        answers: [
          ...currentProgress.answers,
          evaluateAnswer(question, questionIndex, optionIndex),
        ],
        updatedAt: Date.now(),
      };
    });
  }

  function handleNextQuestion() {
    if (!progress || !currentAnswer) {
      return;
    }

    if (progress.currentIndex >= progress.questionOrder.length - 1) {
      clearStoredProgress();
      setSavedProgress(null);
      setProgress({
        ...progress,
        updatedAt: Date.now(),
      });
      setScreen("result");
      return;
    }

    setProgress({
      ...progress,
      currentIndex: progress.currentIndex + 1,
      updatedAt: Date.now(),
    });
  }

  function handleChooseAnotherVariant() {
    clearStoredProgress();
    setProgress(null);
    setSavedProgress(null);
    setErrorMessage(null);
    setScreen("start");
  }

  function handleRetryVariant() {
    if (!progress) {
      return;
    }

    handleStartVariant(progress.variantId);
  }

  if (screen === "quiz") {
    if (
      !progress ||
      !activeVariant?.isValid ||
      !currentQuestion ||
      currentQuestionIndex === undefined
    ) {
      return (
        <AppShell>
          <ErrorScreen
            message="Тест не удалось открыть: данные вопроса не найдены."
            onBack={handleChooseAnotherVariant}
          />
        </AppShell>
      );
    }

    return (
      <AppShell>
        <QuizScreen
          answer={currentAnswer}
          onNext={handleNextQuestion}
          onSelectAnswer={handleSelectAnswer}
          progress={progress}
          question={currentQuestion}
          questionIndex={currentQuestionIndex}
          variant={activeVariant}
        />
      </AppShell>
    );
  }

  if (screen === "result") {
    if (!progress || !activeVariant?.isValid) {
      return (
        <AppShell>
          <ErrorScreen
            message="Результат не найден. Можно выбрать вариант и начать заново."
            onBack={handleChooseAnotherVariant}
          />
        </AppShell>
      );
    }

    return (
      <AppShell>
        <ResultScreen
          onChooseAnother={handleChooseAnotherVariant}
          onRetry={handleRetryVariant}
          progress={progress}
          variant={activeVariant}
        />
      </AppShell>
    );
  }

  if (screen === "error") {
    return (
      <AppShell>
        <ErrorScreen
          message={
            errorMessage ??
            "Данные теста не загрузились или имеют неожиданную структуру."
          }
          onBack={handleChooseAnotherVariant}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <StartScreen
        isHydrated={isHydrated}
        onRestartSaved={handleRestartSaved}
        onResume={handleResume}
        onStart={handleStartVariant}
        savedProgress={savedProgress}
        variants={quizVariants}
      />
    </AppShell>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#f6f8fb] px-4 py-4 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-[720px] flex-col sm:min-h-[calc(100dvh-4rem)]">
        {children}
      </div>
    </main>
  );
}

type StartScreenProps = {
  variants: LoadedQuizVariant[];
  savedProgress: QuizProgress | null;
  isHydrated: boolean;
  onStart: (variantId: QuizVariantId) => void;
  onResume: () => void;
  onRestartSaved: () => void;
};

function StartScreen({
  variants,
  savedProgress,
  isHydrated,
  onStart,
  onResume,
  onRestartSaved,
}: StartScreenProps) {
  const savedVariant = savedProgress
    ? getVariantById(savedProgress.variantId)
    : undefined;
  const savedTotal = savedProgress?.questionOrder.length ?? 0;
  const savedCurrent = savedProgress
    ? Math.min(savedProgress.currentIndex + 1, savedTotal)
    : 0;
  const savedAnswered = savedProgress?.answers.length ?? 0;
  const savedPercent =
    savedTotal > 0 ? Math.round((savedAnswered / savedTotal) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col justify-center py-3">
      <header className="mb-5">
        <p className="text-[13px] font-medium text-blue-700">Quiz app</p>
        <h1 className="mt-1 text-[22px] font-semibold leading-7 text-slate-950">
          Выберите вариант теста
        </h1>
      </header>

      {isHydrated && savedProgress && savedVariant?.isValid ? (
        <section className="mb-4 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-blue-700">
                Незавершенный тест
              </p>
              <h2 className="mt-1 text-[17px] font-semibold text-slate-950">
                {savedVariant.title}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-slate-600">
                Вопрос {savedCurrent} из {savedTotal} ·{" "}
                {formatDuration(savedProgress.elapsedSeconds)}
              </p>
            </div>
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700">
              {savedPercent}%
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${savedPercent}%` }}
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className={primaryButtonClass} onClick={onResume}>
              Продолжить тест
            </button>
            <button className={secondaryButtonClass} onClick={onRestartSaved}>
              Начать заново
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        {variants.map((variant) => (
          <button
            className="group rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            disabled={!variant.isValid}
            key={variant.id}
            onClick={() => onStart(variant.id)}
          >
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-[16px] font-semibold text-slate-950">
                  {variant.title}
                </span>
                <span className="mt-1 block text-[13px] text-slate-600">
                  {variant.isValid
                    ? `${variant.questions.length} вопросов`
                    : `Ошибка в ${variant.fileName}`}
                </span>
              </span>
              <span className="rounded-md bg-slate-100 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                Начать
              </span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

type QuizScreenProps = {
  progress: QuizProgress;
  variant: LoadedQuizVariant;
  question: QuizQuestion;
  questionIndex: number;
  answer?: QuizAnswer;
  onSelectAnswer: (optionIndex: number) => void;
  onNext: () => void;
};

function QuizScreen({
  progress,
  variant,
  question,
  questionIndex,
  answer,
  onSelectAnswer,
  onNext,
}: QuizScreenProps) {
  const totalQuestions = variant.questions.length;
  const questionPosition = progress.currentIndex + 1;
  const progressPercent = Math.round((questionPosition / totalQuestions) * 100);
  const isLastQuestion = progress.currentIndex === totalQuestions - 1;
  const correctOptionIndex = getCorrectOptionIndex(question);
  const correctAnswerText =
    correctOptionIndex >= 0
      ? question.options[correctOptionIndex]
      : question.correct_answer;

  return (
    <div className="flex flex-1 flex-col">
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-blue-700">
              {variant.title}
            </p>
            <h1 className="mt-1 text-[19px] font-semibold leading-6 text-slate-950">
              Вопрос {questionPosition} из {totalQuestions}
            </h1>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[12px] text-slate-500">Время</p>
            <p className="text-[15px] font-semibold tabular-nums text-slate-950">
              {formatDuration(progress.elapsedSeconds)}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-slate-500">
          Отвечено {progress.answers.length} из {totalQuestions}
        </p>
      </header>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600">
            № {question.question_number}
          </span>
        </div>

        <h2 className="text-[16px] font-semibold leading-6 text-slate-950">
          {question.question_text}
        </h2>

        <div className="mt-4 grid gap-2.5">
          {question.options.map((option, optionIndex) => {
            const isSelected = answer?.optionIndex === optionIndex;
            const isCorrectOption = correctOptionIndex === optionIndex;

            return (
              <button
                aria-pressed={isSelected}
                className={getOptionButtonClass({
                  isAnswered: Boolean(answer),
                  isCorrectOption,
                  isSelected,
                  isSelectedWrong: Boolean(isSelected && !answer?.isCorrect),
                })}
                disabled={Boolean(answer)}
                key={`${questionIndex}-${optionIndex}-${option}`}
                onClick={() => onSelectAnswer(optionIndex)}
              >
                <span
                  className={getOptionBadgeClass({
                    isAnswered: Boolean(answer),
                    isCorrectOption,
                    isSelected,
                    isSelectedWrong: Boolean(isSelected && !answer?.isCorrect),
                  })}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>

        {answer ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p
              className={`text-[14px] font-semibold ${
                answer.isCorrect ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {answer.isCorrect ? "Верно" : "Неверно"}
            </p>
            <p className="mt-2 text-[14px] leading-5 text-slate-700">
              Правильный ответ:{" "}
              <span className="font-semibold text-slate-950">
                {correctAnswerText}
              </span>
            </p>
            {question.reference ? (
              <p className="mt-2 text-[13px] leading-5 text-slate-500">
                Источник: {question.reference}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <footer className="sticky bottom-0 -mx-4 mt-auto bg-[#f6f8fb]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:px-0 sm:pt-5">
        <button
          className={primaryButtonClass}
          disabled={!answer}
          onClick={onNext}
        >
          {isLastQuestion ? "Показать результат" : "Следующий вопрос"}
        </button>
      </footer>
    </div>
  );
}

type ResultScreenProps = {
  progress: QuizProgress;
  variant: LoadedQuizVariant;
  onRetry: () => void;
  onChooseAnother: () => void;
};

function ResultScreen({
  progress,
  variant,
  onRetry,
  onChooseAnother,
}: ResultScreenProps) {
  const summary = getResultSummary(progress.answers, variant.questions.length);
  const resultMessage = getResultMessage(summary.percent);
  const statItems = [
    {
      label: "Правильные",
      value: summary.correctCount.toString(),
      tone: "text-emerald-700",
    },
    {
      label: "Неправильные",
      value: summary.incorrectCount.toString(),
      tone: "text-red-700",
    },
    {
      label: "Процент",
      value: `${summary.percent}%`,
      tone: "text-blue-700",
    },
    {
      label: "Время",
      value: formatDuration(progress.elapsedSeconds),
      tone: "text-slate-950",
    },
  ];

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <header className="mb-4">
        <p className="text-[13px] font-medium text-blue-700">
          {variant.title}
        </p>
        <h1 className="mt-1 text-[22px] font-semibold leading-7 text-slate-950">
          {resultMessage}
        </h1>
        <p className="mt-2 text-[14px] leading-5 text-slate-600">
          Итог за {variant.questions.length} вопросов
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {statItems.map((item) => (
          <div
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            key={item.label}
          >
            <p className="text-[12px] font-medium text-slate-500">
              {item.label}
            </p>
            <p className={`mt-1 text-[21px] font-semibold ${item.tone}`}>
              {item.value}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button className={primaryButtonClass} onClick={onRetry}>
          Пройти заново
        </button>
        <button className={secondaryButtonClass} onClick={onChooseAnother}>
          Выбрать другой вариант
        </button>
      </div>
    </div>
  );
}

type ErrorScreenProps = {
  message: string;
  onBack: () => void;
};

function ErrorScreen({ message, onBack }: ErrorScreenProps) {
  return (
    <section className="my-auto rounded-lg border border-red-100 bg-white p-4 shadow-sm">
      <p className="text-[13px] font-medium text-red-700">Ошибка</p>
      <h1 className="mt-1 text-[20px] font-semibold text-slate-950">
        Не удалось открыть тест
      </h1>
      <p className="mt-2 text-[14px] leading-5 text-slate-600">{message}</p>
      <button className={`${primaryButtonClass} mt-4`} onClick={onBack}>
        На главный экран
      </button>
    </section>
  );
}

function getVariantById(variantId: QuizVariantId): LoadedQuizVariant | undefined {
  return quizVariants.find((variant) => variant.id === variantId);
}

function getOptionButtonClass({
  isAnswered,
  isCorrectOption,
  isSelected,
  isSelectedWrong,
}: {
  isAnswered: boolean;
  isCorrectOption: boolean;
  isSelected: boolean;
  isSelectedWrong: boolean;
}) {
  const baseClass =
    "flex min-h-12 w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-[14px] leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

  if (!isAnswered) {
    return `${baseClass} border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60`;
  }

  if (isCorrectOption) {
    return `${baseClass} border-emerald-500 bg-emerald-50 text-emerald-950`;
  }

  if (isSelectedWrong) {
    return `${baseClass} border-red-400 bg-red-50 text-red-950`;
  }

  if (isSelected) {
    return `${baseClass} border-emerald-500 bg-emerald-50 text-emerald-950`;
  }

  return `${baseClass} border-slate-200 bg-slate-50 text-slate-500`;
}

function getOptionBadgeClass({
  isAnswered,
  isCorrectOption,
  isSelected,
  isSelectedWrong,
}: {
  isAnswered: boolean;
  isCorrectOption: boolean;
  isSelected: boolean;
  isSelectedWrong: boolean;
}) {
  const baseClass =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold";

  if (!isAnswered) {
    return `${baseClass} border-slate-300 bg-slate-50 text-slate-600`;
  }

  if (isCorrectOption || isSelected) {
    return `${baseClass} ${
      isSelectedWrong
        ? "border-red-300 bg-red-100 text-red-800"
        : "border-emerald-300 bg-emerald-100 text-emerald-800"
    }`;
  }

  return `${baseClass} border-slate-200 bg-white text-slate-400`;
}
