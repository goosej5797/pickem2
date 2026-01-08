/**
 * TypeScript models for the Sports League Application database schema
 * Generated from docs/database_schema.md
 */

// ============================================
// Enums
// ============================================

export enum CompetitionStatus {
  Upcoming = 'Upcoming',
  Active = 'Active',
  Locked = 'Locked',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

export enum GameStatus {
  Scheduled = 'Scheduled',
  InProgress = 'InProgress',
  Final = 'Final',
  Postponed = 'Postponed',
  Cancelled = 'Cancelled',
}

export enum PickType {
  Straight = 'Straight',
  Spread = 'Spread',
  OverUnder = 'OverUnder',
  Moneyline = 'Moneyline',
}

export enum Sport {
  NFL = 'NFL',
  NBA = 'NBA',
  MLB = 'MLB',
  NHL = 'NHL',
}

// ============================================
// Model Interfaces
// ============================================

/**
 * User account information and authentication details
 */
export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  isPremium: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Competition league that users can join
 */
export interface League {
  id: string;
  name: string;
  description: string | null;
  adminUserId: string;
  inviteCode: string;
  seasonYear: number;
  sport: string;
  maxMembers: number;
  isActive: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Junction table linking users to leagues
 */
export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string | null;
  joinedAt: Date;
  isActive: boolean;
}

/**
 * Weekly competition within a league
 */
export interface Competition {
  id: string;
  leagueId: string;
  weekNumber: number;
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  lockDate: Date;
  status: CompetitionStatus;
  competitionType: string;
  scoringCalculated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Individual games that users can make picks on
 */
export interface Game {
  id: string;
  competitionId: string;
  externalGameId: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamScore: number | null;
  awayTeamScore: number | null;
  gameDate: Date;
  venue: string | null;
  status: GameStatus;
  spreadLine: number | null;
  overUnderLine: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User picks/predictions for games
 */
export interface Pick {
  id: string;
  competitionId: string;
  gameId: string;
  userId: string;
  pickedTeam: string;
  confidencePoints: number;
  pickType: PickType;
  additionalData: string | null;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  submittedAt: Date;
  updatedAt: Date;
}

/**
 * Aggregated scores for users in competitions
 */
export interface Score {
  id: string;
  competitionId: string;
  userId: string;
  totalPoints: number;
  correctPicks: number;
  totalPicks: number;
  rank: number | null;
  calculatedAt: Date;
}

/**
 * Season-long cumulative standings for users in a league
 */
export interface SeasonStanding {
  id: string;
  leagueId: string;
  userId: string;
  totalPoints: number;
  weeksParticipated: number;
  totalCorrectPicks: number;
  totalPicks: number;
  averagePointsPerWeek: number | null;
  rank: number | null;
  updatedAt: Date;
}

/**
 * User notifications for events and updates
 */
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * Audit trail for critical actions
 */
export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ============================================
// DTO Types (for API requests/responses)
// ============================================

/**
 * User creation payload (without auto-generated fields)
 */
export type CreateUserDto = Pick<User, 'email' | 'username' | 'passwordHash'> &
  Partial<Pick<User, 'firstName' | 'lastName'>>;

/**
 * User update payload
 */
export type UpdateUserDto = Partial<
  Pick<User, 'email' | 'username' | 'firstName' | 'lastName' | 'isActive' | 'isPremium'>
>;

/**
 * League creation payload
 */
export type CreateLeagueDto = Pick<League, 'name' | 'adminUserId' | 'inviteCode' | 'seasonYear'> &
  Partial<Pick<League, 'description' | 'sport' | 'maxMembers' | 'isPublic'>>;

/**
 * League update payload
 */
export type UpdateLeagueDto = Partial<
  Pick<League, 'name' | 'description' | 'maxMembers' | 'isActive' | 'isPublic'>
>;

/**
 * Competition creation payload
 */
export type CreateCompetitionDto = Pick<
  Competition,
  'leagueId' | 'weekNumber' | 'name' | 'startDate' | 'endDate' | 'lockDate'
> &
  Partial<Pick<Competition, 'description' | 'competitionType'>>;

/**
 * Game creation payload
 */
export type CreateGameDto = Pick<Game, 'competitionId' | 'homeTeam' | 'awayTeam' | 'gameDate'> &
  Partial<
    Pick<
      Game,
      'externalGameId' | 'venue' | 'spreadLine' | 'overUnderLine' | 'homeMoneyline' | 'awayMoneyline'
    >
  >;

/**
 * Pick creation payload
 */
export type CreatePickDto = Pick<Pick, 'competitionId' | 'gameId' | 'userId' | 'pickedTeam'> &
  Partial<Pick<Pick, 'confidencePoints' | 'pickType' | 'additionalData'>>;

// ============================================
// View Types (matching SQL views)
// ============================================

/**
 * Competition leaderboard view
 */
export interface CompetitionLeaderboard {
  competitionId: string;
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  totalPoints: number;
  correctPicks: number;
  totalPicks: number;
  rank: number | null;
  winPercentage: number | null;
  calculatedAt: Date;
}

/**
 * Season leaderboard view
 */
export interface SeasonLeaderboard {
  leagueId: string;
  leagueName: string;
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  totalPoints: number;
  weeksParticipated: number;
  totalCorrectPicks: number;
  totalPicks: number;
  averagePointsPerWeek: number | null;
  rank: number | null;
  winPercentage: number | null;
  updatedAt: Date;
}
