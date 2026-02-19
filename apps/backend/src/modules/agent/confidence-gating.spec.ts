import { evaluateConfidence } from './confidence-gating';

describe('evaluateConfidence', () => {
  it('returns HIGH and allows apply when score >= 0.8', () => {
    const result = evaluateConfidence(0.8);

    expect(result.level).toBe('HIGH');
    expect(result.applyAllowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns MEDIUM and allows apply with warning when score is between 0.5 and 0.79', () => {
    const result = evaluateConfidence(0.65);

    expect(result.level).toBe('MEDIUM');
    expect(result.applyAllowed).toBe(true);
    expect(result.warning).toContain('Confiance moyenne');
  });

  it('returns LOW and blocks apply when score is below 0.5', () => {
    const result = evaluateConfidence(0.2);

    expect(result.level).toBe('LOW');
    expect(result.applyAllowed).toBe(false);
    expect(result.warning).toContain('Confiance basse');
  });

  it('treats null/undefined as LOW confidence', () => {
    const fromNull = evaluateConfidence(null);
    const fromUndefined = evaluateConfidence(undefined);

    expect(fromNull.level).toBe('LOW');
    expect(fromUndefined.level).toBe('LOW');
    expect(fromNull.applyAllowed).toBe(false);
    expect(fromUndefined.applyAllowed).toBe(false);
  });
});