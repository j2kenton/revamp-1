import { withJitter } from '@/lib/utils/backoff';

describe('withJitter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the midpoint when random() is 0', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);

    expect(withJitter(1000)).toBe(500);
  });

  it('returns the full delay when random() approaches 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    expect(withJitter(1000)).toBe(1000);
  });

  it('never returns less than half the delay, so a retry is never instant', () => {
    for (let i = 0; i < 200; i++) {
      const result = withJitter(1000);
      expect(result).toBeGreaterThanOrEqual(500);
      expect(result).toBeLessThanOrEqual(1000);
    }
  });

  it('produces varied values across calls so clients desynchronize', () => {
    const results = new Set(
      Array.from({ length: 50 }, () => withJitter(10_000)),
    );

    // Plain exponential backoff would return one identical value every time.
    expect(results.size).toBeGreaterThan(1);
  });

  it('handles a zero delay without returning NaN', () => {
    expect(withJitter(0)).toBe(0);
  });
});
