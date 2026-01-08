const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET scores for a competition (leaderboard)
app.http('getCompetitionScores', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/scores/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .input('competitionId', sql.UniqueIdentifier, competitionId)
                    .query(`
                        SELECT s.*, u.Username, u.FirstName, u.LastName
                        FROM Scores s
                        INNER JOIN Users u ON s.UserId = u.Id
                        WHERE s.Id = @id AND s.CompetitionId = @competitionId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Score not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT s.*, u.Username, u.FirstName, u.LastName,
                           CAST(s.CorrectPicks AS FLOAT) / NULLIF(s.TotalPicks, 0) * 100 AS WinPercentage
                    FROM Scores s
                    INNER JOIN Users u ON s.UserId = u.Id
                    WHERE s.CompetitionId = @competitionId
                    ORDER BY s.TotalPoints DESC, s.CorrectPicks DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching scores:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET user's scores across competitions
app.http('getUserScores', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/scores',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT s.*, c.Name AS CompetitionName, c.WeekNumber, l.Name AS LeagueName
                    FROM Scores s
                    INNER JOIN Competitions c ON s.CompetitionId = c.Id
                    INNER JOIN Leagues l ON c.LeagueId = l.Id
                    WHERE s.UserId = @userId
                    ORDER BY c.WeekNumber DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching user scores:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE or UPDATE score (upsert)
app.http('upsertScore', {
    methods: ['POST', 'PUT'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/scores',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const body = await request.json();

            const { userId, totalPoints, correctPicks, totalPicks, rank } = body;

            if (!userId) {
                return { status: 400, jsonBody: { error: 'userId is required' } };
            }

            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('totalPoints', sql.Decimal(10, 2), totalPoints || 0)
                .input('correctPicks', sql.Int, correctPicks || 0)
                .input('totalPicks', sql.Int, totalPicks || 0)
                .input('rank', sql.Int, rank || null)
                .query(`
                    MERGE Scores AS target
                    USING (SELECT @competitionId AS CompetitionId, @userId AS UserId) AS source
                    ON target.CompetitionId = source.CompetitionId AND target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET TotalPoints = @totalPoints,
                                   CorrectPicks = @correctPicks,
                                   TotalPicks = @totalPicks,
                                   Rank = @rank,
                                   CalculatedAt = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (CompetitionId, UserId, TotalPoints, CorrectPicks, TotalPicks, Rank)
                        VALUES (@competitionId, @userId, @totalPoints, @correctPicks, @totalPicks, @rank)
                    OUTPUT INSERTED.*;
                `);

            return { status: 200, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error upserting score:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// Calculate and update all scores for a competition
app.http('calculateCompetitionScores', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/scores/calculate',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;

            // Calculate scores based on picks and game results
            await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    -- Update IsCorrect and PointsEarned for each pick
                    UPDATE p
                    SET IsCorrect = CASE
                        WHEN g.Status = 'Final' AND (
                            (p.PickedTeam = g.HomeTeam AND g.HomeTeamScore > g.AwayTeamScore) OR
                            (p.PickedTeam = g.AwayTeam AND g.AwayTeamScore > g.HomeTeamScore)
                        ) THEN 1
                        WHEN g.Status = 'Final' THEN 0
                        ELSE NULL
                    END,
                    PointsEarned = CASE
                        WHEN g.Status = 'Final' AND (
                            (p.PickedTeam = g.HomeTeam AND g.HomeTeamScore > g.AwayTeamScore) OR
                            (p.PickedTeam = g.AwayTeam AND g.AwayTeamScore > g.HomeTeamScore)
                        ) THEN p.ConfidencePoints
                        ELSE 0
                    END
                    FROM Picks p
                    INNER JOIN Games g ON p.GameId = g.Id
                    WHERE p.CompetitionId = @competitionId;

                    -- Upsert aggregated scores
                    MERGE Scores AS target
                    USING (
                        SELECT
                            @competitionId AS CompetitionId,
                            UserId,
                            SUM(ISNULL(PointsEarned, 0)) AS TotalPoints,
                            SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END) AS CorrectPicks,
                            COUNT(*) AS TotalPicks
                        FROM Picks
                        WHERE CompetitionId = @competitionId
                        GROUP BY UserId
                    ) AS source
                    ON target.CompetitionId = source.CompetitionId AND target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET TotalPoints = source.TotalPoints,
                                   CorrectPicks = source.CorrectPicks,
                                   TotalPicks = source.TotalPicks,
                                   CalculatedAt = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (CompetitionId, UserId, TotalPoints, CorrectPicks, TotalPicks)
                        VALUES (source.CompetitionId, source.UserId, source.TotalPoints, source.CorrectPicks, source.TotalPicks);

                    -- Update ranks
                    WITH RankedScores AS (
                        SELECT Id, RANK() OVER (ORDER BY TotalPoints DESC, CorrectPicks DESC) AS NewRank
                        FROM Scores
                        WHERE CompetitionId = @competitionId
                    )
                    UPDATE s
                    SET Rank = r.NewRank
                    FROM Scores s
                    INNER JOIN RankedScores r ON s.Id = r.Id;

                    -- Mark competition as scored
                    UPDATE Competitions
                    SET ScoringCalculated = 1, UpdatedAt = GETUTCDATE()
                    WHERE Id = @competitionId;
                `);

            // Return updated leaderboard
            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT s.*, u.Username, u.FirstName, u.LastName
                    FROM Scores s
                    INNER JOIN Users u ON s.UserId = u.Id
                    WHERE s.CompetitionId = @competitionId
                    ORDER BY s.Rank ASC
                `);

            return { jsonBody: { message: 'Scores calculated successfully', leaderboard: result.recordset } };
        } catch (err) {
            context.error('Error calculating scores:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE score
app.http('deleteScore', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/scores/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    DELETE FROM Scores
                    OUTPUT DELETED.Id
                    WHERE Id = @id AND CompetitionId = @competitionId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Score not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting score:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
