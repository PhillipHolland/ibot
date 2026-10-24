/** First visible row of the 6-row LCD window. The selection sits on row 3 when it can. */
export function windowStart(index, length, rows) {
  const n = Math.max(0, length | 0);
  const r = Math.max(1, rows | 0);
  const i = Math.max(0, Math.min(n - 1, index | 0));
  return Math.max(0, Math.min(i - 2, n - r));
}
