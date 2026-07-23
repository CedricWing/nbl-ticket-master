// Typed wrapper around the ticketing-api HTTP surface — one function per endpoint, JWT
// attached automatically, non-2xx responses normalized into ApiError.

// Server Components (e.g. the games list on `/`) run inside the ticketing-web container itself,
// where NEXT_PUBLIC_API_URL's "localhost:3000" resolves to that same container, not the API one
// — so server-side calls need the Docker-network hostname instead. API_INTERNAL_URL carries that
// and is intentionally NOT prefixed with NEXT_PUBLIC_, so it's never inlined into the browser
// bundle; from the browser, this branch is always undefined and falls through to the public URL.
const API_BASE_URL =
  typeof window === 'undefined'
    ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000');

const TOKEN_STORAGE_KEY = 'nbl_token';
const USER_STORAGE_KEY = 'nbl_user';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Token lives in localStorage — there's no server session, so these are only ever called
// from Client Components (the pages that need auth are all interactive anyway).
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// Stored alongside the token so pages can show the signed-in name/role (e.g. gate the admin
// link) without decoding the JWT or re-fetching on every navigation.
export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function setUser(user: User): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function logout(): void {
  clearToken();
  clearUser();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(response.status, body.error ?? 'Request failed');
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// --- Shared domain types (mirror the API's actual response shapes) ---

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'member' | 'admin';
}

export interface Team {
  id: string;
  name: string;
  city: string;
  homeVenue?: string;
}

export interface GameSummary {
  id: string;
  startsAt: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: string | null;
  homeTeam: Team;
  awayTeam: Team;
}

export interface Seat {
  id: string;
  gameId: string;
  seatTemplateId: string | null;
  section: string;
  row: string;
  seatNumber: number;
  priceCents: number;
  status: 'available' | 'booked' | 'reserved_season';
}

export interface GameDetail extends GameSummary {
  seats: Seat[];
}

export interface Ticket {
  id: string;
  seatId: string;
  gameId: string;
  userId: string;
  status: 'confirmed' | 'refunded';
  priceCents: number;
  idempotencyKey: string | null;
  createdAt: string;
  refundedAt: string | null;
  refundedBy: string | null;
}

export interface MyTicket {
  id: string;
  status: 'confirmed' | 'refunded';
  priceCents: number;
  createdAt: string;
  seat: { id: string; section: string; row: string; seatNumber: number; status: Seat['status'] };
  game: {
    id: string;
    startsAt: string;
    status: GameSummary['status'];
    homeTeam: Team;
    awayTeam: Team;
  };
}

export interface GameTicket {
  id: string;
  status: 'confirmed' | 'refunded';
  priceCents: number;
  createdAt: string;
  seat: { id: string; section: string; row: string; seatNumber: number };
  user: { id: string; name: string; email: string };
}

// --- Auth ---

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

// --- Teams ---

export async function getTeams() {
  return apiFetch<{ teams: Team[] }>('/teams');
}

// --- Profile ---

export async function getMySeasonStatus() {
  return apiFetch<{ isSeasonHolder: boolean; teams: string[] }>('/me/season-status');
}

// --- Games ---

export async function getGames() {
  return apiFetch<{ games: GameSummary[] }>('/games');
}

export async function getGame(id: string) {
  return apiFetch<GameDetail>(`/games/${id}`);
}

export async function createGame(input: {
  homeTeamId: string;
  awayTeamId: string;
  startsAt: string;
}) {
  return apiFetch<GameDetail>('/games', { method: 'POST', body: input });
}

export async function updateGame(
  id: string,
  input: { startsAt?: string; status?: 'upcoming' | 'completed' | 'cancelled' },
) {
  return apiFetch<GameDetail>(`/games/${id}`, { method: 'PATCH', body: input });
}

export async function adjustCapacity(
  gameId: string,
  input: { section: string; row: string; delta: number; priceCents?: number },
) {
  return apiFetch<{ seats: Seat[] }>(`/games/${gameId}/capacity`, { method: 'PATCH', body: input });
}

// --- Tickets ---

export async function bookTicket(seatId: string, idempotencyKey?: string) {
  return apiFetch<Ticket>('/tickets', {
    method: 'POST',
    body: { seatId },
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
}

export async function getMyTickets() {
  return apiFetch<{ tickets: MyTicket[] }>('/tickets/me');
}

export async function getGameTickets(gameId: string) {
  return apiFetch<{ tickets: GameTicket[] }>(`/games/${gameId}/tickets`);
}

export async function refundTicket(ticketId: string, idempotencyKey?: string) {
  return apiFetch<Ticket>(`/tickets/${ticketId}/refund`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  });
}
