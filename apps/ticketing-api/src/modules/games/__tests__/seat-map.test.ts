import { describe, expect, it } from 'vitest';
import { buildSeatRows } from '../seat-map.js';

describe('buildSeatRows', () => {
  it('generates the correct coordinates for a single section', () => {
    const rows = buildSeatRows([{ section: 'A', rows: 2, seatsPerRow: 3, priceCents: 5000 }]);

    expect(rows).toEqual([
      { section: 'A', row: '1', seatNumber: 1, priceCents: 5000 },
      { section: 'A', row: '1', seatNumber: 2, priceCents: 5000 },
      { section: 'A', row: '1', seatNumber: 3, priceCents: 5000 },
      { section: 'A', row: '2', seatNumber: 1, priceCents: 5000 },
      { section: 'A', row: '2', seatNumber: 2, priceCents: 5000 },
      { section: 'A', row: '2', seatNumber: 3, priceCents: 5000 },
    ]);
  });

  it('supports multiple sections with independent pricing', () => {
    const rows = buildSeatRows([
      { section: 'A', rows: 1, seatsPerRow: 1, priceCents: 10000 },
      { section: 'B', rows: 1, seatsPerRow: 1, priceCents: 5000 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ section: 'A', priceCents: 10000 });
    expect(rows[1]).toMatchObject({ section: 'B', priceCents: 5000 });
  });

  it('returns an empty array for an empty seat map', () => {
    expect(buildSeatRows([])).toEqual([]);
  });
});
