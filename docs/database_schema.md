# Database Schema - Sports League Application

## Overview
This document defines the relational database schema for the sports league competition application using Azure SQL Database (Serverless).

**Database Version:** 1.0  
**Last Updated:** December 23, 2024  
**Target Platform:** Azure SQL Database (Serverless tier)

---

## Schema Design Principles

- **Normalized structure** for data integrity and efficient storage
- **Indexed foreign keys** for optimal query performance
- **UTC timestamps** for all date/time fields
- **Soft deletes** where appropriate for audit trail
- **GUID primary keys** for distributed system compatibility

---

## Tables

### 1. Users

Stores user account information and authentication details.

```sql
CREATE TABLE Users (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email NVARCHAR(255) NOT NULL UNIQUE,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    IsActive BIT NOT NULL DEFAULT 1,
    IsPremium BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    LastLoginAt DATETIME2,
    
    INDEX IX_Users_Email (Email),
    INDEX IX_Users_Username (Username)
);
```

**Fields:**
- `Id`: Unique identifier for the user
- `Email`: User's email address (must be unique)
- `Username`: Display name (must be unique)
- `PasswordHash`: Bcrypt hashed password
- `FirstName/LastName`: Optional personal information
- `IsActive`: Account status flag
- `IsPremium`: Premium subscription status
- `CreatedAt`: Account creation timestamp
- `UpdatedAt`: Last profile update timestamp
- `LastLoginAt`: Last successful login timestamp

---

### 2. Leagues

Represents a competition league that users can join.

```sql
CREATE TABLE Leagues (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    AdminUserId UNIQUEIDENTIFIER NOT NULL,
    InviteCode NVARCHAR(20) NOT NULL UNIQUE,
    SeasonYear INT NOT NULL,
    Sport NVARCHAR(50) NOT NULL DEFAULT 'NFL',
    MaxMembers INT NOT NULL DEFAULT 20,
    IsActive BIT NOT NULL DEFAULT 1,
    IsPublic BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_Leagues_AdminUser FOREIGN KEY (AdminUserId) 
        REFERENCES Users(Id) ON DELETE NO ACTION,
    
    INDEX IX_Leagues_InviteCode (InviteCode),
    INDEX IX_Leagues_AdminUserId (AdminUserId),
    INDEX IX_Leagues_SeasonYear (SeasonYear)
);
```

**Fields:**
- `Id`: Unique identifier for the league
- `Name`: League name (e.g., "Friends & Family 2025")
- `Description`: Optional league description
- `AdminUserId`: User who created and manages the league
- `InviteCode`: Unique code for joining (e.g., "PLAYOFFS2025")
- `SeasonYear`: Competition season year
- `Sport`: Sport type (NFL, NBA, etc.)
- `MaxMembers`: Maximum number of members allowed
- `IsActive`: Whether the league is currently active
- `IsPublic`: Whether league appears in public listings
- `CreatedAt/UpdatedAt`: Timestamps

---

### 3. LeagueMembers

Junction table linking users to leagues.

```sql
CREATE TABLE LeagueMembers (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    DisplayName NVARCHAR(100),
    JoinedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    IsActive BIT NOT NULL DEFAULT 1,
    
    CONSTRAINT FK_LeagueMembers_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT FK_LeagueMembers_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_LeagueMembers_LeagueUser UNIQUE (LeagueId, UserId),
    
    INDEX IX_LeagueMembers_LeagueId (LeagueId),
    INDEX IX_LeagueMembers_UserId (UserId)
);
```

**Fields:**
- `Id`: Unique identifier for the membership
- `LeagueId`: Reference to the league
- `UserId`: Reference to the user
- `DisplayName`: Optional custom display name within this league
- `JoinedAt`: When the user joined the league
- `IsActive`: Whether membership is currently active

---

### 4. Competitions

Represents a weekly competition within a league.

```sql
CREATE TABLE Competitions (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    WeekNumber INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    StartDate DATETIME2 NOT NULL,
    EndDate DATETIME2 NOT NULL,
    LockDate DATETIME2 NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Upcoming',
    CompetitionType NVARCHAR(50) NOT NULL DEFAULT 'Standard',
    ScoringCalculated BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_Competitions_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Competitions_LeagueWeek UNIQUE (LeagueId, WeekNumber),
    CONSTRAINT CK_Competitions_Status CHECK (Status IN ('Upcoming', 'Active', 'Locked', 'Completed', 'Cancelled')),
    
    INDEX IX_Competitions_LeagueId (LeagueId),
    INDEX IX_Competitions_Status (Status),
    INDEX IX_Competitions_WeekNumber (WeekNumber)
);
```

**Fields:**
- `Id`: Unique identifier for the competition
- `LeagueId`: Reference to the parent league
- `WeekNumber`: Week number in the season (1-18 for NFL)
- `Name`: Competition name (e.g., "Week 1 Picks")
- `Description`: Optional competition details
- `StartDate`: When the competition period begins
- `EndDate`: When the competition period ends
- `LockDate`: Deadline for submitting/editing picks
- `Status`: Current status of the competition
- `CompetitionType`: Type of competition (Standard, Playoff, Championship)
- `ScoringCalculated`: Whether final scores have been calculated
- `CreatedAt/UpdatedAt`: Timestamps

**Status values:**
- `Upcoming`: Not yet started, picks can be submitted
- `Active`: In progress, games being played
- `Locked`: Picks locked, games in progress
- `Completed`: All games finished, scores calculated
- `Cancelled`: Competition cancelled

---

### 5. Games

Represents individual games that users can make picks on.

```sql
CREATE TABLE Games (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    ExternalGameId NVARCHAR(100),
    HomeTeam NVARCHAR(100) NOT NULL,
    AwayTeam NVARCHAR(100) NOT NULL,
    HomeTeamScore INT,
    AwayTeamScore INT,
    GameDate DATETIME2 NOT NULL,
    Venue NVARCHAR(200),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    SpreadLine DECIMAL(5,2),
    OverUnderLine DECIMAL(5,2),
    HomeMoneyline INT,
    AwayMoneyline INT,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_Games_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT CK_Games_Status CHECK (Status IN ('Scheduled', 'InProgress', 'Final', 'Postponed', 'Cancelled')),
    
    INDEX IX_Games_CompetitionId (CompetitionId),
    INDEX IX_Games_GameDate (GameDate),
    INDEX IX_Games_Status (Status),
    INDEX IX_Games_ExternalGameId (ExternalGameId)
);
```

**Fields:**
- `Id`: Unique identifier for the game
- `CompetitionId`: Reference to the parent competition
- `ExternalGameId`: Reference ID from sports data API
- `HomeTeam/AwayTeam`: Team names or codes
- `HomeTeamScore/AwayTeamScore`: Final or current scores
- `GameDate`: Scheduled game start time
- `Venue`: Stadium or location
- `Status`: Current game status
- `SpreadLine`: Point spread (negative = home favored)
- `OverUnderLine`: Total points over/under
- `HomeMoneyline/AwayMoneyline`: Betting odds
- `CreatedAt/UpdatedAt`: Timestamps

---

### 6. Picks

Stores user picks/predictions for games.

```sql
CREATE TABLE Picks (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    GameId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    PickedTeam NVARCHAR(100) NOT NULL,
    ConfidencePoints INT NOT NULL DEFAULT 1,
    PickType NVARCHAR(20) NOT NULL DEFAULT 'Straight',
    AdditionalData NVARCHAR(MAX),
    IsCorrect BIT,
    PointsEarned DECIMAL(10,2),
    SubmittedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_Picks_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Picks_Game FOREIGN KEY (GameId) 
        REFERENCES Games(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Picks_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Picks_GameUser UNIQUE (GameId, UserId),
    CONSTRAINT CK_Picks_ConfidencePoints CHECK (ConfidencePoints BETWEEN 1 AND 20),
    
    INDEX IX_Picks_CompetitionId (CompetitionId),
    INDEX IX_Picks_GameId (GameId),
    INDEX IX_Picks_UserId (UserId)
);
```

**Fields:**
- `Id`: Unique identifier for the pick
- `CompetitionId`: Reference to the competition
- `GameId`: Reference to the game
- `UserId`: Reference to the user who made the pick
- `PickedTeam`: Team the user picked to win
- `ConfidencePoints`: Confidence ranking (1-20, higher = more confident)
- `PickType`: Type of pick (Straight, Spread, OverUnder, Moneyline)
- `AdditionalData`: JSON field for future extensibility
- `IsCorrect`: Whether the pick was correct (null until graded)
- `PointsEarned`: Points awarded for this pick
- `SubmittedAt`: When the pick was submitted
- `UpdatedAt`: Last modification timestamp

---

### 7. Scores

Aggregated scores for users in competitions.

```sql
CREATE TABLE Scores (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TotalPoints DECIMAL(10,2) NOT NULL DEFAULT 0,
    CorrectPicks INT NOT NULL DEFAULT 0,
    TotalPicks INT NOT NULL DEFAULT 0,
    Rank INT,
    CalculatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_Scores_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Scores_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Scores_CompetitionUser UNIQUE (CompetitionId, UserId),
    
    INDEX IX_Scores_CompetitionId (CompetitionId),
    INDEX IX_Scores_UserId (UserId),
    INDEX IX_Scores_TotalPoints (TotalPoints DESC)
);
```

**Fields:**
- `Id`: Unique identifier for the score entry
- `CompetitionId`: Reference to the competition
- `UserId`: Reference to the user
- `TotalPoints`: Total points earned in the competition
- `CorrectPicks`: Number of correct picks
- `TotalPicks`: Total number of picks made
- `Rank`: User's rank in the competition (1 = first place)
- `CalculatedAt`: When scores were last calculated

---

### 8. SeasonStandings

Season-long cumulative standings for users in a league.

```sql
CREATE TABLE SeasonStandings (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TotalPoints DECIMAL(10,2) NOT NULL DEFAULT 0,
    WeeksParticipated INT NOT NULL DEFAULT 0,
    TotalCorrectPicks INT NOT NULL DEFAULT 0,
    TotalPicks INT NOT NULL DEFAULT 0,
    AveragePointsPerWeek DECIMAL(10,2),
    Rank INT,
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_SeasonStandings_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT FK_SeasonStandings_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_SeasonStandings_LeagueUser UNIQUE (LeagueId, UserId),
    
    INDEX IX_SeasonStandings_LeagueId (LeagueId),
    INDEX IX_SeasonStandings_UserId (UserId),
    INDEX IX_SeasonStandings_TotalPoints (TotalPoints DESC)
);
```

**Fields:**
- `Id`: Unique identifier for the standing entry
- `LeagueId`: Reference to the league
- `UserId`: Reference to the user
- `TotalPoints`: Cumulative points across all competitions
- `WeeksParticipated`: Number of weeks user participated
- `TotalCorrectPicks`: Total correct picks across season
- `TotalPicks`: Total picks made across season
- `AveragePointsPerWeek`: Average points per week
- `Rank`: User's rank in season standings
- `UpdatedAt`: Last update timestamp

---

### 9. Notifications

User notifications for events and updates.

```sql
CREATE TABLE Notifications (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER NOT NULL,
    Type NVARCHAR(50) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    RelatedEntityId UNIQUEIDENTIFIER,
    RelatedEntityType NVARCHAR(50),
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    ReadAt DATETIME2,
    
    CONSTRAINT FK_Notifications_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    
    INDEX IX_Notifications_UserId (UserId),
    INDEX IX_Notifications_IsRead (IsRead),
    INDEX IX_Notifications_CreatedAt (CreatedAt DESC)
);
```

**Fields:**
- `Id`: Unique identifier for the notification
- `UserId`: User receiving the notification
- `Type`: Notification type (LeagueInvite, CompetitionStarted, ScoresUpdated, etc.)
- `Title`: Notification title
- `Message`: Notification message body
- `RelatedEntityId`: ID of related entity (league, competition, etc.)
- `RelatedEntityType`: Type of related entity
- `IsRead`: Whether notification has been read
- `CreatedAt`: When notification was created
- `ReadAt`: When notification was read

---

### 10. AuditLog

Audit trail for critical actions.

```sql
CREATE TABLE AuditLog (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER,
    Action NVARCHAR(100) NOT NULL,
    EntityType NVARCHAR(50) NOT NULL,
    EntityId UNIQUEIDENTIFIER NOT NULL,
    OldValues NVARCHAR(MAX),
    NewValues NVARCHAR(MAX),
    IpAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    CONSTRAINT FK_AuditLog_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE SET NULL,
    
    INDEX IX_AuditLog_UserId (UserId),
    INDEX IX_AuditLog_EntityType (EntityType),
    INDEX IX_AuditLog_EntityId (EntityId),
    INDEX IX_AuditLog_CreatedAt (CreatedAt DESC)
);
```

**Fields:**
- `Id`: Unique identifier for the audit entry
- `UserId`: User who performed the action (nullable for system actions)
- `Action`: Action performed (Create, Update, Delete, etc.)
- `EntityType`: Type of entity affected
- `EntityId`: ID of entity affected
- `OldValues`: JSON of previous values (for updates)
- `NewValues`: JSON of new values
- `IpAddress`: User's IP address
- `UserAgent`: User's browser/client info
- `CreatedAt`: When action occurred

---

## Initial Setup Script

Complete database initialization script:

```sql
-- Run this script to create all tables in order

-- 1. Users table (no dependencies)
CREATE TABLE Users (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email NVARCHAR(255) NOT NULL UNIQUE,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    IsActive BIT NOT NULL DEFAULT 1,
    IsPremium BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    LastLoginAt DATETIME2,
    INDEX IX_Users_Email (Email),
    INDEX IX_Users_Username (Username)
);

-- 2. Leagues table (depends on Users)
CREATE TABLE Leagues (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    AdminUserId UNIQUEIDENTIFIER NOT NULL,
    InviteCode NVARCHAR(20) NOT NULL UNIQUE,
    SeasonYear INT NOT NULL,
    Sport NVARCHAR(50) NOT NULL DEFAULT 'NFL',
    MaxMembers INT NOT NULL DEFAULT 20,
    IsActive BIT NOT NULL DEFAULT 1,
    IsPublic BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Leagues_AdminUser FOREIGN KEY (AdminUserId) 
        REFERENCES Users(Id) ON DELETE NO ACTION,
    INDEX IX_Leagues_InviteCode (InviteCode),
    INDEX IX_Leagues_AdminUserId (AdminUserId),
    INDEX IX_Leagues_SeasonYear (SeasonYear)
);

-- 3. LeagueMembers table (depends on Users and Leagues)
CREATE TABLE LeagueMembers (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    DisplayName NVARCHAR(100),
    JoinedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_LeagueMembers_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT FK_LeagueMembers_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_LeagueMembers_LeagueUser UNIQUE (LeagueId, UserId),
    INDEX IX_LeagueMembers_LeagueId (LeagueId),
    INDEX IX_LeagueMembers_UserId (UserId)
);

-- 4. Competitions table (depends on Leagues)
CREATE TABLE Competitions (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    WeekNumber INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    StartDate DATETIME2 NOT NULL,
    EndDate DATETIME2 NOT NULL,
    LockDate DATETIME2 NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Upcoming',
    CompetitionType NVARCHAR(50) NOT NULL DEFAULT 'Standard',
    ScoringCalculated BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Competitions_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Competitions_LeagueWeek UNIQUE (LeagueId, WeekNumber),
    CONSTRAINT CK_Competitions_Status CHECK (Status IN ('Upcoming', 'Active', 'Locked', 'Completed', 'Cancelled')),
    INDEX IX_Competitions_LeagueId (LeagueId),
    INDEX IX_Competitions_Status (Status),
    INDEX IX_Competitions_WeekNumber (WeekNumber)
);

-- 5. Games table (depends on Competitions)
CREATE TABLE Games (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    ExternalGameId NVARCHAR(100),
    HomeTeam NVARCHAR(100) NOT NULL,
    AwayTeam NVARCHAR(100) NOT NULL,
    HomeTeamScore INT,
    AwayTeamScore INT,
    GameDate DATETIME2 NOT NULL,
    Venue NVARCHAR(200),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Scheduled',
    SpreadLine DECIMAL(5,2),
    OverUnderLine DECIMAL(5,2),
    HomeMoneyline INT,
    AwayMoneyline INT,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Games_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT CK_Games_Status CHECK (Status IN ('Scheduled', 'InProgress', 'Final', 'Postponed', 'Cancelled')),
    INDEX IX_Games_CompetitionId (CompetitionId),
    INDEX IX_Games_GameDate (GameDate),
    INDEX IX_Games_Status (Status),
    INDEX IX_Games_ExternalGameId (ExternalGameId)
);

-- 6. Picks table (depends on Competitions, Games, and Users)
CREATE TABLE Picks (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    GameId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    PickedTeam NVARCHAR(100) NOT NULL,
    ConfidencePoints INT NOT NULL DEFAULT 1,
    PickType NVARCHAR(20) NOT NULL DEFAULT 'Straight',
    AdditionalData NVARCHAR(MAX),
    IsCorrect BIT,
    PointsEarned DECIMAL(10,2),
    SubmittedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Picks_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Picks_Game FOREIGN KEY (GameId) 
        REFERENCES Games(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Picks_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Picks_GameUser UNIQUE (GameId, UserId),
    CONSTRAINT CK_Picks_ConfidencePoints CHECK (ConfidencePoints BETWEEN 1 AND 20),
    INDEX IX_Picks_CompetitionId (CompetitionId),
    INDEX IX_Picks_GameId (GameId),
    INDEX IX_Picks_UserId (UserId)
);

-- 7. Scores table (depends on Competitions and Users)
CREATE TABLE Scores (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CompetitionId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TotalPoints DECIMAL(10,2) NOT NULL DEFAULT 0,
    CorrectPicks INT NOT NULL DEFAULT 0,
    TotalPicks INT NOT NULL DEFAULT 0,
    Rank INT,
    CalculatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Scores_Competition FOREIGN KEY (CompetitionId) 
        REFERENCES Competitions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Scores_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_Scores_CompetitionUser UNIQUE (CompetitionId, UserId),
    INDEX IX_Scores_CompetitionId (CompetitionId),
    INDEX IX_Scores_UserId (UserId),
    INDEX IX_Scores_TotalPoints (TotalPoints DESC)
);

-- 8. SeasonStandings table (depends on Leagues and Users)
CREATE TABLE SeasonStandings (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    LeagueId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TotalPoints DECIMAL(10,2) NOT NULL DEFAULT 0,
    WeeksParticipated INT NOT NULL DEFAULT 0,
    TotalCorrectPicks INT NOT NULL DEFAULT 0,
    TotalPicks INT NOT NULL DEFAULT 0,
    AveragePointsPerWeek DECIMAL(10,2),
    Rank INT,
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_SeasonStandings_League FOREIGN KEY (LeagueId) 
        REFERENCES Leagues(Id) ON DELETE CASCADE,
    CONSTRAINT FK_SeasonStandings_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_SeasonStandings_LeagueUser UNIQUE (LeagueId, UserId),
    INDEX IX_SeasonStandings_LeagueId (LeagueId),
    INDEX IX_SeasonStandings_UserId (UserId),
    INDEX IX_SeasonStandings_TotalPoints (TotalPoints DESC)
);

-- 9. Notifications table (depends on Users)
CREATE TABLE Notifications (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER NOT NULL,
    Type NVARCHAR(50) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    RelatedEntityId UNIQUEIDENTIFIER,
    RelatedEntityType NVARCHAR(50),
    IsRead BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    ReadAt DATETIME2,
    CONSTRAINT FK_Notifications_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE CASCADE,
    INDEX IX_Notifications_UserId (UserId),
    INDEX IX_Notifications_IsRead (IsRead),
    INDEX IX_Notifications_CreatedAt (CreatedAt DESC)
);

-- 10. AuditLog table (depends on Users)
CREATE TABLE AuditLog (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER,
    Action NVARCHAR(100) NOT NULL,
    EntityType NVARCHAR(50) NOT NULL,
    EntityId UNIQUEIDENTIFIER NOT NULL,
    OldValues NVARCHAR(MAX),
    NewValues NVARCHAR(MAX),
    IpAddress NVARCHAR(45),
    UserAgent NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_AuditLog_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE SET NULL,
    INDEX IX_AuditLog_UserId (UserId),
    INDEX IX_AuditLog_EntityType (EntityType),
    INDEX IX_AuditLog_EntityId (EntityId),
    INDEX IX_AuditLog_CreatedAt (CreatedAt DESC)
);

-- Create a view for easy leaderboard queries
GO
CREATE VIEW vw_CompetitionLeaderboard AS
SELECT 
    s.CompetitionId,
    s.UserId,
    u.Username,
    u.FirstName,
    u.LastName,
    s.TotalPoints,
    s.CorrectPicks,
    s.TotalPicks,
    s.Rank,
    CAST(s.CorrectPicks AS FLOAT) / NULLIF(s.TotalPicks, 0) * 100 AS WinPercentage,
    s.CalculatedAt
FROM Scores s
INNER JOIN Users u ON s.UserId = u.Id
WHERE u.IsActive = 1;
GO

-- Create a view for season standings
CREATE VIEW vw_SeasonLeaderboard AS
SELECT 
    ss.LeagueId,
    l.Name AS LeagueName,
    ss.UserId,
    u.Username,
    u.FirstName,
    u.LastName,
    ss.TotalPoints,
    ss.WeeksParticipated,
    ss.TotalCorrectPicks,
    ss.TotalPicks,
    ss.AveragePointsPerWeek,
    ss.Rank,
    CAST(ss.TotalCorrectPicks AS FLOAT) / NULLIF(ss.TotalPicks, 0) * 100 AS WinPercentage,
    ss.UpdatedAt
FROM SeasonStandings ss
INNER JOIN Users u ON ss.UserId = u.Id
INNER JOIN Leagues l ON ss.LeagueId = l.Id
WHERE u.IsActive = 1 AND l.IsActive = 1;
GO
```

---

## Sample Data (Optional)

For testing purposes, here's some sample data:

```sql
-- Insert a test user
INSERT INTO Users (Email, Username, PasswordHash, FirstName, LastName)
VALUES ('testuser@example.com', 'testuser', 'hashed_password_here', 'Test', 'User');

-- Insert a test league
DECLARE @UserId UNIQUEIDENTIFIER = (SELECT Id FROM Users WHERE Username = 'testuser');
INSERT INTO Leagues (Name, Description, AdminUserId, InviteCode, SeasonYear, Sport)
VALUES ('Test League', 'A test league for development', @UserId, 'TEST2025', 2025, 'NFL');

-- Insert league membership
DECLARE @LeagueId UNIQUEIDENTIFIER = (SELECT Id FROM Leagues WHERE InviteCode = 'TEST2025');
INSERT INTO LeagueMembers (LeagueId, UserId)
VALUES (@LeagueId, @UserId);
```

---

## Migration Notes

### From Cosmos DB to Azure SQL

If migrating from existing Cosmos DB setup:

1. **Export existing data** from Cosmos DB containers
2. **Transform to relational format** (denormalize embedded documents)
3. **Import into SQL tables** using bulk insert
4. **Update application connection strings** in Key Vault
5. **Update Azure Function App** to use SQL connection
6. **Test thoroughly** before decommissioning Cosmos DB

### Future Schema Changes

For future modifications:

- Use migration scripts with version numbers
- Always backup before schema changes
- Test migrations in dev environment first
- Consider using a migration tool like Flyway or Entity Framework Migrations

---

## Performance Considerations

**Indexing Strategy:**
- All foreign keys are indexed
- Frequently queried columns have indexes
- Composite indexes on LeagueId + UserId for member queries
- Descending indexes on TotalPoints for leaderboards

**Query Optimization:**
- Use the provided views for common leaderboard queries
- Consider materialized views for complex aggregations
- Monitor query performance with Azure SQL Query Performance Insights

**Scaling:**
- Start with Basic tier (5 DTUs) for MVP
- Serverless tier auto-scales based on usage
- Monitor DTU usage and upgrade tier if needed

---

## Security Considerations

- **Never store plain text passwords** - always use bcrypt or similar
- **Use parameterized queries** to prevent SQL injection
- **Store connection strings** in Azure Key Vault
- **Enable Azure SQL Auditing** for compliance
- **Use row-level security** for multi-tenant scenarios (future)
- **Regular backups** enabled by default in Azure SQL

---

## Next Steps

1. **Create Azure SQL Database** (Serverless tier)
2. **Run the initial setup script** to create all tables
3. **Update Azure Key Vault** with SQL connection string
4. **Install `mssql` npm package** in Function App
5. **Create database service layer** in your backend
6. **Test basic CRUD operations** before full migration

---

## Questions or Issues?

Document any schema questions or issues encountered during implementation for future reference.
