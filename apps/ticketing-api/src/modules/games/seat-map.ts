export interface SeatSectionInput {
  section: string;
  rows: number;
  seatsPerRow: number;
  priceCents: number;
}

export interface SeatRowInput {
  section: string;
  row: string;
  seatNumber: number;
  priceCents: number;
}

// Expands a compact per-section spec into one entry per individual seat.
export function buildSeatRows(seatMap: SeatSectionInput[]): SeatRowInput[] {
  const result: SeatRowInput[] = [];

  for (const { section, rows, seatsPerRow, priceCents } of seatMap) {
    for (let row = 1; row <= rows; row++) {
      for (let seatNumber = 1; seatNumber <= seatsPerRow; seatNumber++) {
        result.push({ section, row: String(row), seatNumber, priceCents });
      }
    }
  }

  return result;
}
