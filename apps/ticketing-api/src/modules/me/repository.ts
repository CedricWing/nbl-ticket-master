import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../shared/database/client.js';
import { seasonSeatAssignments, seatTemplates, teams } from '../games/index.js';

export async function findSeasonHolderTeamNames(db: DbOrTx, userId: string) {
  const rows = await db
    .select({ teamName: teams.name })
    .from(seasonSeatAssignments)
    .innerJoin(seatTemplates, eq(seasonSeatAssignments.seatTemplateId, seatTemplates.id))
    .innerJoin(teams, eq(seatTemplates.teamId, teams.id))
    .where(eq(seasonSeatAssignments.userId, userId));

  return rows.map((row) => row.teamName);
}
