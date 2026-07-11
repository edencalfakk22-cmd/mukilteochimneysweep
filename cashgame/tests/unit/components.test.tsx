// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import { MoneyDisplay, MoneyInput, QuickAmountButtons } from "@/components/money";
import { DebtBadge, PaymentMethodBadge, SessionStatusBadge } from "@/components/domain-badges";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { SummaryRow } from "@/components/session/approval";

describe("MoneyDisplay", () => {
  it("formats agorot as whole shekels with the ₪ symbol", () => {
    render(<MoneyDisplay amount={150_000} />);
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
    expect(screen.getByText(/₪/)).toBeInTheDocument();
  });

  it("shows an explicit plus sign when requested", () => {
    render(<MoneyDisplay amount={50_000} withSign />);
    expect(screen.getByText(/\+500/)).toBeInTheDocument();
  });

  it("auto tone: negative amounts are red, positive green", () => {
    const { container: neg } = render(<MoneyDisplay amount={-1000} tone="auto" />);
    expect(neg.querySelector("span")).toHaveClass("text-debt");
    const { container: pos } = render(<MoneyDisplay amount={1000} tone="auto" />);
    expect(pos.querySelector("span")).toHaveClass("text-money-in");
  });
});

describe("MoneyInput", () => {
  it("reports integer agorot while formatting the visible text", () => {
    const onChange = vi.fn();
    render(<MoneyInput id="m" label="סכום" valueAgorot={null} onChangeAgorot={onChange} />);
    const input = screen.getByLabelText("סכום") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1500" } });
    expect(onChange).toHaveBeenLastCalledWith(150_000);
    expect(input.value).toBe("1,500");
  });

  it("ignores non-numeric characters without corrupting the value", () => {
    const onChange = vi.fn();
    render(<MoneyInput id="m2" label="סכום" valueAgorot={null} onChangeAgorot={onChange} />);
    const input = screen.getByLabelText("סכום") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1a2b3" } });
    expect(onChange).toHaveBeenLastCalledWith(12_300);
    expect(input.value).toBe("123");
  });

  it("syncs when the value is set from outside (quick buttons)", () => {
    const { rerender } = render(
      <MoneyInput id="m3" label="סכום" valueAgorot={null} onChangeAgorot={() => {}} />,
    );
    rerender(<MoneyInput id="m3" label="סכום" valueAgorot={200_000} onChangeAgorot={() => {}} />);
    expect((screen.getByLabelText("סכום") as HTMLInputElement).value).toBe("2,000");
  });

  it("uses the numeric mobile keyboard", () => {
    render(<MoneyInput id="m4" label="סכום" valueAgorot={null} onChangeAgorot={() => {}} />);
    expect(screen.getByLabelText("סכום")).toHaveAttribute("inputmode", "numeric");
  });
});

describe("QuickAmountButtons", () => {
  it("one tap reports the amount in agorot", () => {
    const onPick = vi.fn();
    render(<QuickAmountButtons amounts={[20_000, 50_000]} onPick={onPick} />);
    fireEvent.click(screen.getByText(/200/));
    expect(onPick).toHaveBeenCalledWith(20_000);
  });
});

describe("DebtBadge", () => {
  it("shows a green no-debt badge at zero", () => {
    render(<DebtBadge amount={0} />);
    expect(screen.getByText("ללא חוב")).toBeInTheDocument();
  });

  it("shows the debt amount with an explicit label (not color alone)", () => {
    render(<DebtBadge amount={80_000} />);
    expect(screen.getByText(/חוב/)).toBeInTheDocument();
    expect(screen.getByText(/800/)).toBeInTheDocument();
  });
});

describe("PaymentMethodBadge / SessionStatusBadge", () => {
  it("renders Hebrew payment-method labels", () => {
    render(<PaymentMethodBadge method="BIT" />);
    expect(screen.getByText("ביט")).toBeInTheDocument();
  });

  it("renders nothing without a method", () => {
    const { container } = render(<PaymentMethodBadge method={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders Hebrew session statuses", () => {
    render(<SessionStatusBadge status="OPEN" />);
    expect(screen.getByText("פתוח")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("EmptyState renders title and description", () => {
    render(<EmptyState title="אין נתונים" description="נסה מאוחר יותר" />);
    expect(screen.getByText("אין נתונים")).toBeInTheDocument();
    expect(screen.getByText("נסה מאוחר יותר")).toBeInTheDocument();
  });

  it("ErrorState exposes a retry action", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="שגיאה" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("נסה שוב"));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("ConnectionIndicator", () => {
  it("shows connected state when online", () => {
    render(<ConnectionIndicator />);
    expect(screen.getByText("מחובר")).toBeInTheDocument();
  });
});

describe("SummaryRow", () => {
  it("renders a before/after style label-value pair", () => {
    render(
      <SummaryRow label="חוב לפני" strong>
        <MoneyDisplay amount={100_000} />
      </SummaryRow>,
    );
    expect(screen.getByText("חוב לפני")).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });
});
