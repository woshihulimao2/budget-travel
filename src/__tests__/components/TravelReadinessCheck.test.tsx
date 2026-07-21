// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TravelReadinessCheck, { STEP_KEYS, STEP_TO_CATEGORY } from "../../components/TravelReadinessCheck";

describe("TravelReadinessCheck — progress computation", () => {
  it("renders 0% when nothing is checked", () => {
    render(<TravelReadinessCheck completedSteps={{}} onToggle={() => {}} />);
    expect(screen.getByText(/0% 已完成/)).toBeTruthy();
  });

  it("renders 50% when half is checked", () => {
    const half: Record<string, boolean> = {};
    STEP_KEYS.slice(0, 3).forEach((k) => (half[k] = true));
    render(<TravelReadinessCheck completedSteps={half} onToggle={() => {}} />);
    expect(screen.getByText(/50% 已完成/)).toBeTruthy();
  });

  it("renders 100% + celebration message when all checked", () => {
    const all: Record<string, boolean> = {};
    STEP_KEYS.forEach((k) => (all[k] = true));
    render(<TravelReadinessCheck completedSteps={all} onToggle={() => {}} />);
    expect(screen.getByText(/100% 已完成/)).toBeTruthy();
    expect(screen.getByText(/整备完毕/)).toBeTruthy();
  });
});

describe("TravelReadinessCheck — interaction", () => {
  it("calls onToggle with the step key when clicked", () => {
    const onToggle = vi.fn();
    render(<TravelReadinessCheck completedSteps={{}} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("step-pay1"));
    expect(onToggle).toHaveBeenCalledWith("pay1");
  });

  it("renders one button per step", () => {
    render(<TravelReadinessCheck completedSteps={{}} onToggle={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(STEP_KEYS.length);
  });

  it("marks checked steps with aria-pressed=true", () => {
    render(<TravelReadinessCheck completedSteps={{ vpn1: true }} onToggle={() => {}} />);
    expect(screen.getByTestId("step-vpn1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("step-pay1").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("TravelReadinessCheck — compact mode", () => {
  it("renders compact counter without checklist items", () => {
    const half: Record<string, boolean> = {};
    STEP_KEYS.slice(0, 3).forEach((k) => (half[k] = true));
    const { container } = render(
      <TravelReadinessCheck completedSteps={half} onToggle={() => {}} compact />,
    );
    expect(screen.getByText("3/6 已就绪")).toBeTruthy();
    // No step buttons in compact mode
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // Ensure the big card title is gone
    expect(container.textContent?.includes("您的旅行整备度")).toBe(false);
  });
});

describe("STEP_TO_CATEGORY mapping", () => {
  it("maps every step to one of the SURVIVAL_TIP categories", () => {
    const allowed = new Set(["Payment", "Internet", "Transit", "Apps", "Visa", "Essentials"]);
    for (const key of STEP_KEYS) {
      expect(allowed.has(STEP_TO_CATEGORY[key])).toBe(true);
    }
  });
});