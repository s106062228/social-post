import { computeScore, scoreLabel } from "../content-score";

describe("computeScore", () => {
  it("returns 0 for empty insights", () => {
    expect(computeScore({})).toBe(0);
  });

  it("returns 0 for all-null insights", () => {
    expect(
      computeScore({
        impressions: null,
        reach: null,
        likes: null,
        comments: null,
        shares: null,
      })
    ).toBe(0);
  });

  it("weights impressions at 0.5", () => {
    expect(computeScore({ impressions: 100 })).toBe(50);
  });

  it("weights reach at 1", () => {
    expect(computeScore({ reach: 100 })).toBe(100);
  });

  it("weights likes at 3", () => {
    expect(computeScore({ likes: 10 })).toBe(30);
  });

  it("weights comments at 5", () => {
    expect(computeScore({ comments: 10 })).toBe(50);
  });

  it("weights shares at 4", () => {
    expect(computeScore({ shares: 10 })).toBe(40);
  });

  it("sums all weighted signals", () => {
    const score = computeScore({
      impressions: 1000,
      reach: 800,
      likes: 50,
      comments: 20,
      shares: 15,
    });
    // 1000*0.5 + 800*1 + 50*3 + 20*5 + 15*4 = 500+800+150+100+60 = 1610
    expect(score).toBe(1610);
  });
});

describe("scoreLabel", () => {
  it("returns 'none' for 0", () => {
    expect(scoreLabel(0)).toBe("none");
  });

  it("returns 'low' for scores under 50", () => {
    expect(scoreLabel(1)).toBe("low");
    expect(scoreLabel(49)).toBe("low");
  });

  it("returns 'medium' for scores 50–499", () => {
    expect(scoreLabel(50)).toBe("medium");
    expect(scoreLabel(499)).toBe("medium");
  });

  it("returns 'high' for scores 500–4999", () => {
    expect(scoreLabel(500)).toBe("high");
    expect(scoreLabel(4999)).toBe("high");
  });

  it("returns 'viral' for scores >= 5000", () => {
    expect(scoreLabel(5000)).toBe("viral");
    expect(scoreLabel(100000)).toBe("viral");
  });
});
