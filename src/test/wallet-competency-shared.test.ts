import { describe, expect, it } from "vitest";
import {
  deriveWalletPracticalTaskStatus,
  deriveWalletRecordStatus,
} from "@/lib/wallet-competency-shared";

describe("wallet practical task statuses", () => {
  it("derives timed-out and scored statuses correctly", () => {
    expect(deriveWalletPracticalTaskStatus({ status: "timed_out" })).toBe("Timed Out");
    expect(deriveWalletPracticalTaskStatus({ passed: true, scorePercent: 100 })).toBe("Passed");
    expect(deriveWalletPracticalTaskStatus({ scorePercent: 40 })).toBe("Needs Improvement");
    expect(deriveWalletPracticalTaskStatus({})).toBe("Submitted");
  });

  it("maps timed-out status into wallet status", () => {
    expect(deriveWalletRecordStatus({
      githubCount: 0,
      lmsCount: 0,
      practicalTaskStatus: "Timed Out",
      peerReviewCount: 0,
    })).toBe("Timed Out");
  });
});
