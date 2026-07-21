/**
 * ScamExam — the 防坑情景模拟器, upgraded to a real exam.
 *
 * State machine:
 *   intro        — title + total question count + "开始考试" button
 *   in-progress  — randomized question order, countdown per question (30s)
 *                  click an option → instantly show correct/wrong + explanation
 *                  "下一题" advances; "提交" finishes
 *   result       — final score badge, plus a "错题本" of every wrong/timed-out
 *                  question with the correct answer + explanation
 *
 * Replaces the dashboard simulator (App.tsx ~L1357-1465). Now lives at the
 * top of the 防坑指南 tab.
 *
 * No external state. Each <ScamExam> instance is self-contained, which means
 * navigating away from the tab will reset progress. This is the intended
 * behaviour for v1 (small quiz, low stakes).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

export interface ScamExamQuestion {
  question: string;
  options: string[];
  /** Index of the correct option (0-based) */
  answer: number;
  explanation: string;
}

export interface ScamExamProps {
  questions: ScamExamQuestion[];
  cityName: string;
  timePerQuestionSec?: number;
}

type Phase = "intro" | "in-progress" | "result";

interface AnswerLog {
  qIdx: number;
  chosen: number | "timeout";
  correct: boolean;
  timeMs: number;
}

function shuffle<T>(arr: T[]): T[] {
  // Avoid mutating input; OK to use Math.random for a quiz.
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ScamExam({ questions, cityName, timePerQuestionSec = 30 }: ScamExamProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [order, setOrder] = useState<number[]>(() => questions.map((_, i) => i));
  const [qIndex, setQIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [logs, setLogs] = useState<AnswerLog[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(timePerQuestionSec);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = order.length;
  const correctCount = useMemo(() => logs.filter((l) => l.correct).length, [logs]);
  const wrongQuestions = useMemo(() => {
    const out: { q: ScamExamQuestion; chosen: number | "timeout" }[] = [];
    for (const log of logs) {
      if (!log.correct) {
        const q = questions[order[log.qIdx]];
        out.push({ q, chosen: log.chosen });
      }
    }
    return out;
  }, [logs, order, questions]);

  // Timer
  useEffect(() => {
    if (phase !== "in-progress") return;
    if (chosen !== null) return; // paused once answered
    if (secondsLeft <= 0) {
      handleTimeout();
      return;
    }
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => s - 1);
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, chosen, secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    setOrder(shuffle(questions.map((_, i) => i)));
    setQIndex(0);
    setChosen(null);
    setLogs([]);
    setSecondsLeft(timePerQuestionSec);
    setPhase("in-progress");
  }

  function handleAnswer(optionIdx: number) {
    if (chosen !== null) return;
    const elapsed = timePerQuestionSec - secondsLeft;
    const isCorrect = optionIdx === questions[order[qIndex]].answer;
    setChosen(optionIdx);
    setLogs((prev) => [
      ...prev,
      { qIdx: qIndex, chosen: optionIdx, correct: isCorrect, timeMs: elapsed * 1000 },
    ]);
    if (tickRef.current) clearInterval(tickRef.current);
  }

  function handleTimeout() {
    if (chosen !== null) return;
    setChosen(-1);
    setLogs((prev) => [
      ...prev,
      { qIdx: qIndex, chosen: "timeout", correct: false, timeMs: timePerQuestionSec * 1000 },
    ]);
    if (tickRef.current) clearInterval(tickRef.current);
  }

  function nextQuestion() {
    if (qIndex + 1 < total) {
      setQIndex((i) => i + 1);
      setChosen(null);
      setSecondsLeft(timePerQuestionSec);
    } else {
      setPhase("result");
    }
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 text-slate-500 text-sm text-center">
        当前城市暂无考题，请切换其他城市试试。
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xs">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-rose-600 uppercase font-bold">
            互动实战演练 · 防坑结业考试
          </span>
          <h3 className="text-xl font-extrabold text-slate-950 mt-1">{cityName}防坑情景模拟器</h3>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          系统会随机抽题、共 <strong>{total}</strong> 题。每题限时{" "}
          <strong className="text-rose-600">{timePerQuestionSec}s</strong>，超时算答错。
          完成后查看错题本，巩固薄弱环节。
        </p>
        <button
          type="button"
          onClick={start}
          data-testid="exam-start"
          className="self-start bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>开始考试</span>
        </button>
      </div>
    );
  }

  if (phase === "result") {
    const scorePct = Math.round((correctCount / total) * 100);
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xs">
        <div className="text-center py-4 space-y-4">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h4 className="text-xl font-extrabold text-slate-900">演练全部完成！</h4>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            您的最终防坑雷达评分：
            <strong data-testid="exam-final-score" className="text-indigo-600">
              {correctCount} / {total} （{scorePct}% 免疫套路）
            </strong>
          </p>
          <button
            type="button"
            onClick={start}
            className="bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>重新考一遍</span>
          </button>
        </div>

        {wrongQuestions.length > 0 && (
          <div className="border-t border-slate-100 pt-5 space-y-4">
            <h5 className="text-xs font-mono font-bold text-rose-600 uppercase tracking-widest">
              错题本（{wrongQuestions.length} 题）
            </h5>
            <ol className="space-y-4 list-decimal pl-5 text-sm">
              {wrongQuestions.map(({ q, chosen }, idx) => (
                <li key={idx} className="space-y-1.5">
                  <p className="text-slate-800 font-medium">「{q.question}」</p>
                  <p className="text-xs text-slate-500">
                    你的选择：
                    {chosen === "timeout" ? (
                      <span className="text-rose-600 font-bold ml-1">超时未答</span>
                    ) : (
                      <span className="text-rose-600 font-bold ml-1">{q.options[chosen]}</span>
                    )}
                  </p>
                  <p className="text-xs text-emerald-700">
                    正确答案：
                    <span className="font-bold ml-1">{q.options[q.answer]}</span>
                  </p>
                  <p className="text-xs text-slate-500 italic">💡 {q.explanation}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  // in-progress
  const q = questions[order[qIndex]];
  const correctIdx = q.answer;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-rose-600 uppercase font-bold">
            互动实战演练
          </span>
          <h3 className="text-xl font-extrabold text-slate-950">{cityName}防坑情景模拟器</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            data-testid="exam-timer"
            className={`text-xs font-mono font-bold px-3 py-1.5 rounded-full ${
              secondsLeft <= 5
                ? "bg-rose-100 text-rose-700 animate-pulse"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            ⏱ {secondsLeft}s
          </span>
          <span className="text-xs bg-slate-100 text-slate-600 font-mono px-3 py-1.5 rounded-full font-bold">
            进度 {qIndex + 1} / {total} · 得分 {correctCount}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <span className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider block mb-2">
            模拟场景 {qIndex + 1} / {total}
          </span>
          <p className="text-base text-slate-800 leading-relaxed font-medium">「{q.question}」</p>
        </div>

        <div className="space-y-3">
          {q.options.map((option, index) => {
            const isSelected = chosen === index;
            const isCorrectOption = index === correctIdx;

            let optionStyle = "border-slate-200 bg-white hover:bg-slate-50 text-slate-800";
            if (chosen !== null) {
              if (isCorrectOption) {
                optionStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-medium";
              } else if (isSelected) {
                optionStyle = "border-rose-500 bg-rose-50 text-rose-900";
              } else {
                optionStyle = "border-slate-100 bg-white text-slate-400 opacity-60";
              }
            }

            return (
              <button
                key={index}
                type="button"
                data-testid={`option-${index}`}
                disabled={chosen !== null}
                onClick={() => handleAnswer(index)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 min-h-[3rem] ${optionStyle}`}
              >
                <span className="font-mono text-xs font-extrabold bg-slate-100 text-slate-600 h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm leading-normal">{option}</span>
              </button>
            );
          })}
        </div>

        {chosen !== null && (
          <div
            data-testid="exam-feedback"
            className={`p-4.5 rounded-xl border ${
              chosen === correctIdx
                ? "bg-emerald-50 border-emerald-100 text-emerald-950"
                : "bg-rose-50 border-rose-100 text-rose-950"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 font-bold text-sm">
              {chosen === correctIdx ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>非常聪明！完美的避坑选择。</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                  <span>糟糕！这是极具诱惑且危险的陷阱。</span>
                </>
              )}
            </div>
            <p className="text-xs leading-relaxed opacity-90">{q.explanation}</p>

            <button
              type="button"
              onClick={nextQuestion}
              className="mt-4 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-1 ml-auto"
            >
              <span>{qIndex < total - 1 ? "下一情景" : "提交并查看结果"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}