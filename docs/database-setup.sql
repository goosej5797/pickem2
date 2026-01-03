-- ================================================================
-- Sports League Application - Database Setup Script
-- Azure SQL Database (Serverless)
-- Version: 1.0
-- ================================================================

-- Drop existing tables if they exist (for clean re-runs)
-- Comment out this section if you want to preserve data

DROP TABLE IF EXISTS AuditLog;
DROP TABLE IF EXISTS Notifications;
DROP TABLE IF EXISTS SeasonStandings;
DROP TABLE IF EXISTS Scores;
DROP TABLE IF EXISTS Picks;
DROP TABLE IF EXISTS Games;
DROP TABLE IF EXISTS Competitions;
DROP TABLE IF EXISTS LeagueMembers;
DROP TABLE IF EXISTS Leagues;
DROP TABLE IF EXISTS Users;

-- ================================================================
-- TABLE CREATION
-- ================================================================

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
-- NOTE: Using NO ACTION on Game and User to avoid cascade path conflicts
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
        REFERENCES Games(Id) ON DELETE NO ACTION,
    CONSTRAINT FK_Picks_User FOREIGN KEY (UserId) 
        REFERENCES Users(Id) ON DELETE NO ACTION,
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
        REFERENCES Users(Id) ON DELETE NO ACTION,
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
        REFERENCES Users(Id) ON DELETE NO ACTION,
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

-- ================================================================
-- VIEWS
-- ================================================================

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

-- ================================================================
-- VERIFICATION
-- ================================================================

-- List all created tables
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- List all created views
SELECT 
    TABLE_NAME
FROM INFORMATION_SCHEMA.VIEWS
ORDER BY TABLE_NAME;

PRINT 'Database setup complete!';
PRINT 'Tables created: 10';
PRINT 'Views created: 2';