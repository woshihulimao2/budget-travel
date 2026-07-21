// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ScamExam, { type ScamExamQuestion } from "../../components/ScamExam";

// Make sure the question order is the original [0,1] for deterministic tests.
// ScamExam uses Fisher-Yates which calls Math.random() * (i+1) and floors it.
// Mocking Math.random = 0 would actually swap last element to first (j=0 swap);
// mocking it to a value near 1 ensures no swaps happen and original order is preserved.
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE: ScamExamQuestion[] = [
  {
    question: "Q1?",
    options: ["A", "B", "C"],
    answer: 1, // B
    explanation: "选 B 因为它是对的。",
  },
  {
    question: "Q2?",
    options: ["X", "Y"],
    answer: 0, // X
    explanation: "选 X。",
  },
];

describe("ScamExam — intro phase", () => {
  it("renders intro screen with start button", () => {
    render(<ScamExam questions={SAMPLE} cityName="杭州" timePerQuestionSec={60} />);
    expect(screen.getByTestId("exam-start")).toBeTruthy();
    // The intro text spans "共 <strong>2</strong> 题" across nodes, so we use
    // a function matcher scoped to <p> elements.
    const ps = screen.getAllByText((content, node) => {
      if (!node || node.tagName !== "P") return false;
      const t = node.textContent || "";
      return t.includes("共") && t.includes("2") && t.includes("题");
    });
    expect(ps.length).toBeGreaterThan(0);
  });
});

describe("ScamExam — in-progress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances to result after answering all questions correctly", () => {
    render(<ScamExam questions={SAMPLE} cityName="杭州" timePerQuestionSec={60} />);
    fireEvent.click(screen.getByTestId("exam-start"));

    // Q1 — pick correct (B = index 1)
    fireEvent.click(screen.getByTestId("option-1"));
    expect(screen.getByTestId("exam-feedback").textContent).toContain("完美的避坑选择");
    fireEvent.click(screen.getByText(/下一情景/));

    // Q2 — pick correct (X = index 0)
    fireEvent.click(screen.getByTestId("option-0"));
    fireEvent.click(screen.getByText(/提交并查看结果/));

    // Result phase: 100% + 错题本 hidden
    const result = screen.getByTestId("exam-final-score");
    expect(result.textContent).toContain("2");
    expect(result.textContent).toContain("100%");
    expect(screen.queryByText(/错题本/)).toBeNull();
  });

  it("marks a wrong answer in the 错题本 with the user's choice and correct answer", () => {
    render(<ScamExam questions={SAMPLE} cityName="杭州" timePerQuestionSec={60} />);
    fireEvent.click(screen.getByTestId("exam-start"));

    // Q1 — pick wrong (A = index 0)
    fireEvent.click(screen.getByTestId("option-0"));
    fireEvent.click(screen.getByText(/下一情景/));

    // Q2 — pick correct
    fireEvent.click(screen.getByTestId("option-0"));
    fireEvent.click(screen.getByText(/提交并查看结果/));

    // Result: 1 / 2 + 1 wrong
    const result = screen.getByTestId("exam-final-score");
    expect(result.textContent).toContain("1");
    expect(result.textContent).toContain("50%");
    expect(screen.getByText(/错题本（1 题）/)).toBeTruthy();
    expect(screen.getByText(/你的选择：/).textContent).toContain("A");
    expect(screen.getByText(/正确答案：/).textContent).toContain("B");
  });

  it("counts a timed-out question as wrong and lists it in the 错题本", () => {
    render(<ScamExam questions={SAMPLE} cityName="杭州" timePerQuestionSec={2} />);
    fireEvent.click(screen.getByTestId("exam-start"));

    // Advance time by 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // After timeout, "下一情景" should appear (timeout auto-records as wrong)
    expect(screen.getByText(/下一情景/)).toBeTruthy();
    fireEvent.click(screen.getByText(/下一情景/));

    // Q2 — pick correct
    fireEvent.click(screen.getByTestId("option-0"));
    fireEvent.click(screen.getByText(/提交并查看结果/));

    const result = screen.getByTestId("exam-final-score");
    expect(result.textContent).toContain("50%");
    expect(screen.getByText(/超时未答/)).toBeTruthy();
  });
});

describe("ScamExam — empty questions", () => {
  it("renders a friendly fallback", () => {
    render(<ScamExam questions={[]} cityName="上海" />);
    expect(screen.getByText(/暂无考题/)).toBeTruthy();
  });
});