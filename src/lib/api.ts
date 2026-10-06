import { getToken, clearToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && token) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Request failed');
  return data as T;
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => request<T>(path, { method: 'DELETE' }),
};

// ── Typed API calls ──────────────────────────────────────────────────────────

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    api.post<{ success: boolean; accessToken: string; admin: { id: string; name: string; role: string } }>(
      '/api/auth/admin/login',
      { email, password },
    ),

  // Stats
  stats: () =>
    api.get<{ success: boolean } & PlatformStats>('/api/admin/stats'),

  // Multi-chain pool balances — one row per configured RavenPrizePool
  // deployment, plus a summed total.
  poolsOverview: () =>
    api.get<{ success: boolean } & PoolsOverview>('/api/admin/pools/overview'),

  // Players
  listPlayers:   () => api.get<{ success: boolean; players: Player[] }>('/api/admin/players'),
  createPlayer:  (data: Partial<Player> & { apiFootballId?: number | null }) =>
    api.post<{ success: boolean; player: Player }>('/api/admin/players', data),
  updatePlayer:  (id: string, data: Partial<Player> & { apiFootballId?: number | null }) =>
    api.put<{ success: boolean; player: Player }>(`/api/admin/players/${id}`, data),
  deletePlayer:  (id: string) => api.delete<{ success: boolean }>(`/api/admin/players/${id}`),
  searchPlayersApi: (q: string, leagueId: number) =>
    api.get<{ success: boolean; players: ApiFootballSuggestion[] }>(
      `/api/admin/players/search-api?q=${encodeURIComponent(q)}&league=${leagueId}`,
    ),
  listTeamsFromApi: (leagueId: number) =>
    api.get<{ success: boolean; teams: ApiTeam[] }>(
      `/api/admin/players/teams-api?league=${leagueId}`,
    ),
  getSquadFromApi: (teamId: number) =>
    api.get<{ success: boolean; players: ApiSquadPlayer[] }>(
      `/api/admin/players/squad-api?team=${teamId}`,
    ),
  searchTeamsFromApi: (name: string) =>
    api.get<{ success: boolean; teams: ApiTeam[] }>(
      `/api/admin/players/team-search-api?name=${encodeURIComponent(name)}`,
    ),
  listDbClubs: () =>
    api.get<{ success: boolean; clubs: string[] }>('/api/admin/players/clubs'),
  deleteTeamPlayers: (clubName: string) =>
    api.delete<{ success: boolean; deleted: number }>(
      `/api/admin/players/by-club?club=${encodeURIComponent(clubName)}`,
    ),
  bulkImportPlayers: (
    players:    { apiFootballId: number; name: string; position: string; photo: string }[],
    leagueName: string,
    clubName:   string,
  ) => api.post<{ success: boolean; imported: number; skipped: number; details: { skipped: { name: string; reason: string }[] } }>(
    '/api/admin/players/bulk-import',
    { players, leagueName, clubName },
  ),
  uploadPlayerImage: (id: string, file: File): Promise<{ success: boolean; imageUrl: string; player: Player }> => {
    const token = getToken();
    const form  = new FormData();
    form.append('image', file);
    return fetch(`${BASE}/api/admin/players/${id}/image`, {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    form,
    }).then(async (res) => {
      const data = await res.json();
      if (res.status === 401 && token) { clearToken(); window.location.href = '/login'; throw new Error('Session expired'); }
      if (!res.ok) throw new Error(data.message ?? 'Upload failed');
      return data;
    });
  },

  // Match Weeks (weekly containers)
  listMatchweeks:             () => api.get<{ success: boolean; matchweeks: Matchday[] }>('/api/admin/matchweeks'),
  createMatchweek:            (data: Partial<Matchday>) => api.post<{ success: boolean; matchweek: Matchday }>('/api/admin/matchweeks', data),
  updateMatchweekStatus:      (id: string, status: string) =>
    api.patch<{ success: boolean; matchweek: Matchday }>(`/api/admin/matchweeks/${id}/status`, { status }),
  startMatchweekLive:         (id: string) =>
    api.post<{ success: boolean; matchweek: Matchday }>(`/api/admin/matchweeks/${id}/start-live`, {}),
  stopMatchweekLive:          (id: string) =>
    api.post<{ success: boolean; matchweek: Matchday }>(`/api/admin/matchweeks/${id}/stop-live`, {}),
  updateMatchweekLiveRankings:(id: string, rankings: LiveRankingsInput) =>
    api.put<{ success: boolean; matchweek: Matchday }>(`/api/admin/matchweeks/${id}/live-rankings`, { rankings }),

  // Classic pools
  createPool: (data: { poolType: 'daily' | 'weekly'; matchweek?: string; matchday?: string; position: string; houseCut?: number }) =>
    api.post<{ success: boolean; pool: ClassicPool }>('/api/admin/classic/pools', data),
  settlePool: (poolId: string, winnerPlayerId: string) =>
    api.post<{ success: boolean; pool: ClassicPool }>(`/api/admin/classic/pools/${poolId}/settle`, { winnerPlayerId }),

  // Match Days (daily containers)
  listMatchdays:              () => api.get<{ success: boolean; matchdays: MatchdayRecord[] }>('/api/admin/matchdays'),
  createMatchday:             (data: { matchDate: string; label?: string; lockDeadline?: string }) =>
    api.post<{ success: boolean; matchday: MatchdayRecord }>('/api/admin/matchdays', data),
  updateMatchdayStatus:       (id: string, status: string) =>
    api.patch<{ success: boolean; matchday: MatchdayRecord }>(`/api/admin/matchdays/${id}/status`, { status }),
  listDailyPools:             (matchdayId: string) =>
    api.get<{ success: boolean; pools: ClassicPool[] }>(`/api/admin/matchdays/${matchdayId}/pools`),
  startMatchdayLive:          (id: string) =>
    api.post<{ success: boolean; matchday: MatchdayRecord }>(`/api/admin/matchdays/${id}/start-live`, {}),
  stopMatchdayLive:           (id: string) =>
    api.post<{ success: boolean; matchday: MatchdayRecord }>(`/api/admin/matchdays/${id}/stop-live`, {}),
  updateMatchdayLiveRankings: (id: string, rankings: LiveRankingsInput) =>
    api.put<{ success: boolean; matchday: MatchdayRecord }>(`/api/admin/matchdays/${id}/live-rankings`, { rankings }),

  // FieldPort Pro — Market Manager
  listProGameweeks: () =>
    api.get<{ success: boolean; gameweeks: ProGameweek[] }>('/api/admin/pro/gameweeks'),
  createProGameweek: (data: {
    number: number; season?: string; opensAt: string; from?: string; to?: string;
    leagueIds?: number[]; isBlackout?: boolean; competitionLabel?: string;
  }) =>
    api.post<{ success: boolean; gameweek: ProGameweek }>('/api/admin/pro/gameweeks', data),
  batchCreateProGameweeks: (data: {
    count: number; startNumber: number; startFrom: string; startOpensAt: string; season?: string;
    leagueIds?: number[]; blackoutOffsets?: number[]; competitionLabel?: string;
  }) =>
    api.post<{ success: boolean; gameweeks: ProGameweek[] }>('/api/admin/pro/gameweeks/batch', data),
  openProGameweek: (id: string, skipRefresh?: boolean) =>
    api.post<{ success: boolean; gameweek: ProGameweek }>(`/api/admin/pro/gameweeks/${id}/open`, { skipRefresh }),
  forceLockProGameweek: (id: string) =>
    api.patch<{ success: boolean; gameweek: ProGameweek }>(`/api/admin/pro/gameweeks/${id}/force-lock`, {}),
  updateProGameweekMeta: (id: string, data: { isBlackout?: boolean; competitionLabel?: string | null }) =>
    api.patch<{ success: boolean; gameweek: ProGameweek }>(`/api/admin/pro/gameweeks/${id}/meta`, data),
  recalculateProPricing: () =>
    api.post<{
      success: boolean;
      metrics: { updated: number; failed: number; teamsProcessed: number; teamsRemaining: number };
      pricing: { priced: number; teamFormCovered: number };
      budgetCap: number;
    }>('/api/admin/pro/pricing/recalculate', {}),
  setProPlayerPrice: (playerId: string, price: number | null) =>
    api.put<{ success: boolean; player: Player }>(`/api/admin/pro/players/${playerId}/price`, { price }),
  refreshPlayerMetrics: (playerId: string) =>
    api.post<{ success: boolean; player: Player }>(`/api/admin/pro/players/${playerId}/refresh-metrics`, {}),
  getMetricsProgress: () =>
    api.get<{ success: boolean; total: number; withRealStats: number }>('/api/admin/pro/pricing/progress'),
  getProConfig: () =>
    api.get<{ success: boolean; config: { budgetCap: number; pricingMultiplier: number } }>('/api/admin/pro/config'),
  updateProConfig: (data: { budgetCap?: number; pricingMultiplier?: number }) =>
    api.put<{ success: boolean; config: { budgetCap: number; pricingMultiplier: number } }>('/api/admin/pro/config', data),
  getProOverview: () =>
    api.get<{ success: boolean; overview: ProOverview | null }>('/api/admin/pro/overview'),
  getProGameweekDetail: (id: string) =>
    api.get<{ success: boolean; detail: ProGameweekDetail }>(`/api/admin/pro/gameweeks/${id}/detail`),
  syncProGameweekFixtures: (id: string) =>
    api.post<{ success: boolean; detail: ProGameweekDetail }>(`/api/admin/pro/gameweeks/${id}/sync-fixtures`, {}),

  // FieldPort Pro — on-chain USDC escrow.
  //
  // Read-only observation plus a single order-free "advance". The lifecycle cron
  // drives this automatically; `advance` is the manual catch-up for when it
  // couldn't run (treasury out of gas, transient RPC failure). It performs at
  // most one step, chosen by reading chain state, so it is safe to press
  // repeatedly and can't strand a pot the way the old ordered
  // fund → lock → publish trio could.
  getProGameweekOnChain: (gameweekId: string) =>
    api.get<{ success: boolean; pool: OnChainPool; gameweekNumber: number; state: OnChainGameweekState }>(
      `/api/admin/pro/gameweeks/${gameweekId}/onchain`,
    ),
  advanceProGameweekOnChain: (gameweekId: string) =>
    api.post<{ success: boolean; outcome: OnChainAdvanceOutcome; detail: string; txHash?: string }>(
      `/api/admin/pro/gameweeks/${gameweekId}/onchain/advance`, {},
    ),
  registerOnChainFunder: (address: string) =>
    api.post<{ success: boolean; txHash: string; funder: string }>('/api/admin/pro/onchain/funder', { address }),

  // FieldPort Pro — Finance Admin
  getProPoolSummary: (gameweekId: string) =>
    api.get<{ success: boolean; summary: ProPoolSummary }>(`/api/admin/pro/gameweeks/${gameweekId}/pool`),
  settleProGameweek: (gameweekId: string) =>
    api.post<{ success: boolean; gameweek: ProGameweek }>(`/api/admin/pro/gameweeks/${gameweekId}/settle`, {}),
  redistributeProPrizes: (gameweekId: string) =>
    api.post<{ success: boolean; redistributed: number }>(`/api/admin/pro/gameweeks/${gameweekId}/redistribute`, {}),
  resetProGameweek: (gameweekId: string) =>
    api.post<{ success: boolean; gameweek: ProGameweek; squadsRefunded: number; refundedTotal: number }>(
      `/api/admin/pro/gameweeks/${gameweekId}/reset`, {},
    ),

  // Users
  // `q` is the backend's free-text search: an exact username, a 0x wallet
  // address, or a 24-char ObjectId. Region went with the old signup form.
  listUsers: (params?: { q?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q)    qs.set('q', params.q);
    if (params?.page) qs.set('page', String(params.page));
    return api.get<{ success: boolean; users: AdminUser[]; total: number; page: number; pages: number }>(`/api/admin/users?${qs}`);
  },
  updateUserStatus: (id: string, isActive: boolean) =>
    api.patch<{ success: boolean; user: AdminUser }>(`/api/admin/users/${id}/status`, { isActive }),

  // Admin management (superadmin only)
  listAdmins: () =>
    api.get<{ success: boolean; admins: AdminMember[] }>('/api/admin/admins'),
  createAdmin: (data: { name: string; email: string; password: string; role: string }) =>
    api.post<{ success: boolean; admin: AdminMember }>('/api/admin/admins', data),
  updateAdmin: (id: string, data: { role?: string; isActive?: boolean; name?: string }) =>
    api.patch<{ success: boolean; admin: AdminMember }>(`/api/admin/admins/${id}`, data),

  // Reserve (superadmin only)
  getReserve: () =>
    api.get<{ success: boolean; reserve: number }>('/api/admin/reserve'),
  setReserve: (balance: number) =>
    api.put<{ success: boolean; reserve: number }>('/api/admin/reserve', { balance }),
  topUpReserve: (amount: number) =>
    api.post<{ success: boolean; reserve: number }>('/api/admin/reserve/topup', { amount }),
  // No `fundReserve`/`verifyReserve` here: the reserve is no longer fundable
  // from the dashboard. Real money is USDC in the treasury, escrowed per
  // gameweek into RavenPrizePool by the lifecycle cron (or, to catch up after
  // a failure, by advanceGameweekPool below). Topping up the reserve only moves
  // an internal ledger number and never touches a chain.

  // Pool seeding from reserve (any pool_manager / superadmin)
  seedPool: (poolId: string, amount: number, playerId: string) =>
    api.post<{ success: boolean; pool: ClassicPool; reserveAfter: number }>(
      `/api/admin/classic/pools/${poolId}/seed`,
      { amount, playerId },
    ),

  // Promo credits (marketing credits from reserve)
  creditUser: (identifier: string, amount: number, note?: string) =>
    api.post<{ success: boolean; user: { _id: string; username: string; walletBalance: number }; transaction: PromoCredit; reserveAfter: number }>(
      '/api/admin/users/credit',
      { identifier, amount, ...(note ? { note } : {}) },
    ),
  listPromoCredits: () =>
    api.get<{ success: boolean; credits: PromoCredit[] }>('/api/admin/users/credits'),

  // Competitions (marketing prizes — real, withdrawable money)
  listCompetitions: () =>
    api.get<{ success: boolean; competitions: Competition[] }>('/api/admin/competitions'),
  createCompetition: (data: {
    title: string; description?: string; market: 'pro' | 'classic' | 'both';
    prizeAmount: number; startsAt?: string; endsAt?: string;
  }) =>
    api.post<{ success: boolean; competition: Competition }>('/api/admin/competitions', data),
  updateCompetitionStatus: (id: string, status: 'draft' | 'active' | 'ended') =>
    api.patch<{ success: boolean; competition: Competition }>(`/api/admin/competitions/${id}/status`, { status }),
  rewardCompetitionWinner: (id: string, identifier: string, amount: number, note?: string) =>
    api.post<{
      success: boolean;
      transaction: CompetitionAward;
      competition: Competition;
      user: { _id: string; username: string; walletBalance: number };
      reserveAfter: number;
    }>(`/api/admin/competitions/${id}/reward`, { identifier, amount, ...(note ? { note } : {}) }),
  listCompetitionAwards: (id: string) =>
    api.get<{ success: boolean; awards: CompetitionAward[] }>(`/api/admin/competitions/${id}/awards`),
};

// ── Shared types (mirrors backend models) ────────────────────────────────────

export interface PlatformStats {
  totalUsers:    number;
  // The regional breakdown went with the old signup form. `_id` is
  // 'connected' when the account has a signing wallet on file and 'none'
  // otherwise — house accounts deliberately have none, so this doubles as a
  // bot-vs-human split.
  usersByWallet: { _id: 'connected' | 'none'; count: number }[];
  // Non-custodial money figures: USDC escrowed per gameweek, what winners have
  // actually claimed on-chain, what's still owed to them, and the outstanding
  // play-money balances (which are not real money).
  revenue: {
    totalEscrowed: number;
    totalPaidOut:  number;
    unclaimed:     number;
    totalWallets:  number;
  } | null;
}

/**
 * The General Manager's view: what every configured pool contract holds.
 *
 * One entry per chain, always — with a single deployment it is one row and a
 * total, and the response shape does not change when a second chain is added.
 * See docs/multi-chain-pool-manager.md.
 */
export interface PoolsOverview {
  /** Sum over `chains` that are `healthy` only. Treat as a floor while
   *  `degraded` is non-empty: an unreachable chain is unknown, not $0. */
  total: number;
  chains: {
    network: string;
    displayName: string;
    chainId: number;
    address: string;
    tokenAddress: string;
    isTestnet: boolean;
    enabled: boolean;
    /** The deployment every single-chain write path currently uses. */
    primary: boolean;
    /** Whole USDC held by the contract, or null when the read failed. */
    totalBalance: number | null;
    /** Where escrow draws from, or null when no key/address is configured. */
    treasuryAddress: string | null;
    /**
     * USDC the treasury holds on this chain — what escrow can fund with.
     * Null means unknown, which is not $0.
     */
    treasuryBalance: number | null;
    /** Why `treasuryBalance` is null, when it is. */
    treasuryError?: string;
    rpcConfigured: boolean;
    /** A treasury/owner key is present, so writes from here could work. */
    signerConfigured: boolean;
    healthy: boolean;
    /** Present only when `healthy` is false — verbatim RPC error. */
    error?: string;
  }[];
  /** Networks whose balance could not be read. */
  degraded: string[];
  /**
   * Can each treasury cover the escrow it still owes for `current`?
   *
   * 'short' needs an operator; 'unknown' means we couldn't read one of the two
   * numbers and is deliberately distinct from both 'funded' and 'short' —
   * treating it as either is how a real gap gets waved through.
   */
  funding: {
    network: string;
    displayName: string;
    treasuryAddress: string | null;
    treasuryBalance: number | null;
    pendingEscrow: number;
    shortfall: number | null;
    state: 'funded' | 'short' | 'unknown';
    reason?: string;
  }[];
  /** The gameweek an operator is watching, for reconciliation against `total`. */
  current: {
    number: number;
    status: string;
    poolTotal: number;
    houseCut: number;
    /** poolTotal − houseCut: exactly what gets escrowed on-chain. */
    distributable: number;
    settledAt: Date | null;
  } | null;
}

export interface Player {
  _id: string;
  name: string;
  shortName: string;
  position: string;
  club: string;
  league: string;
  nationality: string;
  preferredFoot: string;
  rvRating: number;
  basePrice: number;
  imageUrl: string | null;
  isActive: boolean;
  apiFootballId: number | null;
  seasonStats: { appearances: number; goals: number; assists: number; cleanSheets: number; avgRating: number };
  pro?: { playerScore: number; price: number; priceOverride: number | null };
}

/** Shape returned by GET /admin/players/search-api */
export interface ApiFootballSuggestion {
  apiFootballId: number;
  name:          string;
  photo:         string;
  nationality:   string;
  position:      string;   // GK / CB / CAM / ST …
  club:          string;
  clubId:        number;
  league:        string;
  leagueId:      number;
  seasonStats: {
    appearances: number;
    goals:       number;
    assists:     number;
    avgRating:   number;
  };
}

export interface LiveRankEntry {
  playerName: string;
  club:       string;
  rating:     number;
  updatedAt:  string;
}

export interface LiveRankings {
  ATT: LiveRankEntry | null;
  MID: LiveRankEntry | null;
  DEF: LiveRankEntry | null;
  GK:  LiveRankEntry | null;
}

export type LiveRankingsInput = Partial<{
  ATT: { playerName: string; club: string; rating: number };
  MID: { playerName: string; club: string; rating: number };
  DEF: { playerName: string; club: string; rating: number };
  GK:  { playerName: string; club: string; rating: number };
}>;

export interface Matchday {
  _id:           string;
  weekNumber:    number;
  season:        string;
  startsAt:      string;
  endsAt:        string;
  ratingDeadline:string;
  lockDeadline:  string | null;
  status:        'upcoming' | 'open' | 'locked' | 'settled';
  liveActive:    boolean;
  liveStartedAt: string | null;
  liveRankings:  LiveRankings;
}

export interface MatchdayRecord {
  _id:           string;
  matchDate:     string;
  label:         string;
  lockDeadline:  string | null;
  status:        'upcoming' | 'open' | 'locked' | 'settled';
  liveActive:    boolean;
  liveStartedAt: string | null;
  liveRankings:  LiveRankings;
  createdAt:     string;
}

export interface ClassicPool {
  _id:              string;
  poolType:         'daily' | 'weekly';
  matchweek:        string | null;
  matchday:         string | null;
  position:         string;
  houseCut:         number;
  totalPot:         number;
  participantCount: number;
  status:           'open' | 'locked' | 'settled';
  leadingPlayer:    Player | null;
  winnerPlayer:     Player | null;
  houseEntry:       { player: Pick<Player, '_id' | 'name' | 'shortName' | 'position' | 'club'> | null; stake: number } | null;
}

export interface ProGameweek {
  _id: string;
  number: number;
  season: string;
  opensAt: string;
  firstKickoffAt: string | null;
  status: 'upcoming' | 'open' | 'locked' | 'settling' | 'settled';
  isBlackout: boolean;
  competitionLabel: string | null;
  budgetCapSnapshot: number;
  pricingMultiplierSnapshot: number;
  poolTotal: number;
  houseCut: number;
  settledAt: string | null;
}

export interface ProPoolSummary {
  status: string;
  squadCount: number;
  poolTotal: number;
  houseCut: number;
  settledAt: string | null;
}

// ── On-chain USDC escrow ──────────────────────────────────────────────────

/** Deployment-level state. `configured: false` means no PRIZE_POOL_ADDRESS. */
export interface OnChainPool {
  configured: boolean;
  address: string | null;
  network: string | null;
  chainId: number | null;
  escrowBalance: number | null;
}

/** Per-gameweek pot state as the contract sees it. */
export interface OnChainGameweekState {
  configured: true;
  address: string;
  network: string | null;
  /** Whole USDC the contract holds, across every gameweek. */
  escrowBalance: number;
  totalPool: number;
  distributed: number;
  unclaimed: number;
  locked: boolean;
  settled: boolean;
  winners: string[];
  prizes: number[];
}

/**
 * What one `advance` call did.
 *
 * All of these are normal, not errors. The lifecycle cron calls this every
 * five minutes, so most ticks land on `up-to-date` or one of the `awaiting-*`
 * states — those just mean it's the wrong time yet, not that something broke.
 */
export type OnChainAdvanceOutcome =
  | 'escrowed'          // pot funded + frozen on-chain
  | 'locked'            // an already-funded pot was frozen (progressive-funding recovery)
  | 'published'         // top 3 written on-chain; claims now open
  | 'up-to-date'        // on-chain already matches the app
  | 'awaiting-lock'     // still selling — too early to escrow
  | 'awaiting-settle'   // locked but fixtures still running — too early to publish
  | 'awaiting-topup'    // treasury on this chain holds less than the pot it owes
  | 'not-configured'    // no PRIZE_POOL_ADDRESS on this deployment
  | 'waiting-wallets';  // settled, but some winners have no payout address yet

export interface ProOverview {
  gameweek: { _id: string; number: number; status: ProGameweek['status'] };
  squadCount: number;
  totalSpent: number;
  leader: { userId: string; username: string; score: number } | null;
  leaderSource: 'settled' | 'live' | 'none';
}

export interface ProFixture {
  _id: string;
  gameweek: string;
  apiFootballFixtureId: number;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: 'scheduled' | 'live' | 'finished';
  ratingsIngested: boolean;
}

export interface ProRankedSquad {
  userId: string;
  username: string;
  score: number;
  rank: number | null;
}

export interface ProGameweekDetail {
  gameweek: ProGameweek;
  squadCount: number;
  totalSpent: number;
  leader: { userId: string; username: string; score: number } | null;
  leaderSource: 'settled' | 'live' | 'none';
  topSquads: ProRankedSquad[];
  fixtures: ProFixture[];
}

export interface AdminUser {
  _id: string;
  username: string;
  // Immutable — it is what the account signed in with, not something an
  // admin or the user can re-point at a different wallet.
  walletAddress: string | null;
  walletNetwork: string | null;
  referralCode: string;
  currency: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
}

export interface ApiTeam {
  id:   number;
  name: string;
  logo: string;
}

export interface ApiSquadPlayer {
  apiFootballId: number;
  name:          string;
  age:           number;
  number:        number | null;
  position:      string;
  photo:         string;
}

export interface AdminMember {
  _id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'pool_manager' | 'support';
  isActive: boolean;
  createdAt: string;
}

export interface PromoCredit {
  _id: string;
  user: { _id: string; username: string; referralCode: string } | string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  reference: string;
  metadata: { adminId?: string; adminNote?: string | null };
  createdAt: string;
}

export interface Competition {
  _id: string;
  title: string;
  description: string | null;
  market: 'pro' | 'classic' | 'both';
  prizeAmount: number;
  awardedAmount: number;
  status: 'draft' | 'active' | 'ended';
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionAward {
  _id: string;
  user: { _id: string; username: string } | string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  reference: string;
  metadata: { competitionId?: string; adminId?: string; adminNote?: string | null };
  createdAt: string;
}
