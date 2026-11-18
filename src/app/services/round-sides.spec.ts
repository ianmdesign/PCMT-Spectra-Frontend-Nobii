import { shouldFlipSidesForManualRound, sideParityForRound } from "./round-sides";

describe("manual HUD side parity", () => {
  it("flips at halftime and every overtime round", () => {
    expect(sideParityForRound(1)).toBeFalse();
    expect(sideParityForRound(12)).toBeFalse();
    expect(sideParityForRound(13)).toBeTrue();
    expect(sideParityForRound(24)).toBeTrue();
    expect(sideParityForRound(25)).toBeFalse();
    expect(sideParityForRound(26)).toBeTrue();
    expect(sideParityForRound(27)).toBeFalse();
    expect(sideParityForRound(28)).toBeTrue();
  });

  it("applies missing flips if Spectra is stuck in the first half", () => {
    expect(shouldFlipSidesForManualRound(13, 1)).toBeTrue();
    expect(shouldFlipSidesForManualRound(24, 12)).toBeTrue();
    expect(shouldFlipSidesForManualRound(25, 12)).toBeFalse();
    expect(shouldFlipSidesForManualRound(26, 12)).toBeTrue();
    expect(shouldFlipSidesForManualRound(27, 12)).toBeFalse();
  });

  it("does not double-flip if the client already changed sides", () => {
    expect(shouldFlipSidesForManualRound(13, 13)).toBeFalse();
    expect(shouldFlipSidesForManualRound(25, 25)).toBeFalse();
    expect(shouldFlipSidesForManualRound(26, 26)).toBeFalse();
    expect(shouldFlipSidesForManualRound(25, 24)).toBeTrue();
    expect(shouldFlipSidesForManualRound(26, 25)).toBeTrue();
  });

  it("works for a producer correcting the round backward", () => {
    expect(shouldFlipSidesForManualRound(12, 13)).toBeTrue();
    expect(shouldFlipSidesForManualRound(24, 26)).toBeFalse();
    expect(shouldFlipSidesForManualRound(25, 26)).toBeTrue();
  });

  it("supports non-standard halftime and overtime boundaries", () => {
    expect(sideParityForRound(5, 6, 99)).toBeFalse();
    expect(sideParityForRound(6, 6, 99)).toBeTrue();
    expect(sideParityForRound(99, 6, 99)).toBeFalse();
    expect(sideParityForRound(100, 6, 99)).toBeTrue();
  });
});
