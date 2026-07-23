import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from '../../modules/auth/schema.js';
import {
  games as gamesTable,
  seasonSeatAssignments,
  seatTemplates,
  teams,
} from '../../modules/games/schema.js';
import { createGame } from '../../modules/games/service.js';
import { buildSeatRows, type SeatSectionInput } from '../../modules/games/seat-map.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file — env vars provided by the environment (Docker/CI)
}

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

// Demo credentials for the README — same password for all three seeded roles.
const DEMO_PASSWORD = 'password123';

// Real NBL (Australia) teams for a realistic demo, each with its home venue —
// games derive their venue from the home team rather than storing it twice.
const NBL_TEAMS = [
  { name: 'Adelaide 36ers', city: 'Adelaide', homeVenue: 'Adelaide Entertainment Centre' },
  { name: 'Brisbane Bullets', city: 'Brisbane', homeVenue: 'Nissan Arena' },
  { name: 'Cairns Taipans', city: 'Cairns', homeVenue: 'Cairns Convention Centre' },
  { name: 'Illawarra Hawks', city: 'Wollongong', homeVenue: 'WIN Entertainment Centre' },
  { name: 'Melbourne United', city: 'Melbourne', homeVenue: 'John Cain Arena' },
  { name: 'New Zealand Breakers', city: 'Auckland', homeVenue: 'Spark Arena' },
  { name: 'Perth Wildcats', city: 'Perth', homeVenue: 'RAC Arena' },
  {
    name: 'South East Melbourne Phoenix',
    city: 'Melbourne',
    homeVenue: 'State Basketball Centre',
  },
  { name: 'Sydney Kings', city: 'Sydney', homeVenue: 'Qudos Bank Arena' },
  { name: 'Tasmania JackJumpers', city: 'Hobart', homeVenue: 'MyState Bank Arena' },
];

// Every team gets the same seat template layout for this demo — a premium courtside section
// and a larger general-admission section.
const DEFAULT_SEAT_TEMPLATE_MAP: SeatSectionInput[] = [
  { section: 'A', rows: 2, seatsPerRow: 5, priceCents: 8500 },
  { section: 'B', rows: 5, seatsPerRow: 10, priceCents: 4500 },
];

// Real 2026-27 NBL season-opener fixtures (per nbl.com.au's published schedule), so the demo
// has actual games to browse rather than an empty list.
const GAME_FIXTURES = [
  { home: 'Melbourne United', away: 'Adelaide 36ers', startsAt: '2026-09-19T19:30:00+10:00' },
  {
    home: 'Perth Wildcats',
    away: 'South East Melbourne Phoenix',
    startsAt: '2026-09-19T21:30:00+08:00',
  },
  {
    home: 'New Zealand Breakers',
    away: 'Illawarra Hawks',
    startsAt: '2026-09-20T15:00:00+12:00',
  },
  { home: 'Sydney Kings', away: 'Cairns Taipans', startsAt: '2026-09-20T17:00:00+10:00' },
  {
    home: 'Tasmania JackJumpers',
    away: 'South East Melbourne Phoenix',
    startsAt: '2026-09-21T19:30:00+10:00',
  },
  {
    home: 'Brisbane Bullets',
    away: 'New Zealand Breakers',
    startsAt: '2026-09-22T19:30:00+10:00',
  },
];

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db
    .insert(users)
    .values([
      { email: 'admin@example.com', passwordHash, name: 'Admin User', role: 'admin' },
      { email: 'member@example.com', passwordHash, name: 'Member User', role: 'member' },
      {
        // A member who happens to hold a season pass — see the season_seat_assignments
        // insert below, which is what actually makes this account a "season ticket holder".
        email: 'season@example.com',
        passwordHash,
        name: 'Season Ticket Holder',
        role: 'member',
      },
    ])
    .onConflictDoNothing();

  await db.insert(teams).values(NBL_TEAMS).onConflictDoNothing();

  // Every team's seat templates — set up once here, copied into each game's own seats at
  // creation time (see games/service.ts's createGame).
  const allTeams = await db.select().from(teams);
  const seatTemplateRows = allTeams.flatMap((team) =>
    buildSeatRows(DEFAULT_SEAT_TEMPLATE_MAP).map((seat) => ({ ...seat, teamId: team.id })),
  );
  await db.insert(seatTemplates).values(seatTemplateRows).onConflictDoNothing();

  // Give the demo season ticket holder a standing claim on Melbourne United's Section A,
  // Row 1, Seat 1 — honored automatically whenever a Melbourne United home game is created.
  const [seasonHolder] = await db.select().from(users).where(eq(users.email, 'season@example.com'));
  const [melbourneUnited] = await db.select().from(teams).where(eq(teams.name, 'Melbourne United'));

  if (!seasonHolder || !melbourneUnited) {
    throw new Error('Expected demo user/team seeding above to have inserted these rows');
  }

  const [seasonSeat] = await db
    .select()
    .from(seatTemplates)
    .where(
      and(
        eq(seatTemplates.teamId, melbourneUnited.id),
        eq(seatTemplates.section, 'A'),
        eq(seatTemplates.row, '1'),
        eq(seatTemplates.seatNumber, 1),
      ),
    );

  if (!seasonSeat) {
    throw new Error('Expected seat_templates seeding above to have created Melbourne United A-1-1');
  }

  await db
    .insert(seasonSeatAssignments)
    .values({ seatTemplateId: seasonSeat.id, userId: seasonHolder.id })
    .onConflictDoNothing();

  // Games go through the real createGame service (not a raw insert) so each one gets its
  // seats copied from templates and the season holder's seat auto-reserved, same as live.
  const existingGames = await db.select({ id: gamesTable.id }).from(gamesTable);
  let gamesCreated = 0;
  if (existingGames.length === 0) {
    const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));
    if (!admin) throw new Error('Expected demo admin user seeding above to have inserted this row');

    const teamIdByName = new Map(allTeams.map((team) => [team.name, team.id]));
    for (const fixture of GAME_FIXTURES) {
      const homeTeamId = teamIdByName.get(fixture.home);
      const awayTeamId = teamIdByName.get(fixture.away);
      if (!homeTeamId || !awayTeamId) {
        throw new Error(`Unknown team in fixture: ${fixture.home} vs ${fixture.away}`);
      }
      await createGame({
        homeTeamId,
        awayTeamId,
        startsAt: new Date(fixture.startsAt),
        createdBy: admin.id,
      });
      gamesCreated++;
    }
  }

  console.log(
    `Seeded demo users (password for all: "${DEMO_PASSWORD}"), ${NBL_TEAMS.length} teams, ${seatTemplateRows.length} seat templates, 1 season seat assignment, and ${gamesCreated} games`,
  );
}

await seed();
await client.end();
