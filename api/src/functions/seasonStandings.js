const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET season standings for a league
app.http('getSeasonStandings', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/standings/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .input('leagueId', sql.UniqueIdentifier, leagueId)
                    .query(`
                        SELECT ss.*, u.Username, u.FirstName, u.LastName
                        FROM SeasonStandings ss
                        INNER JOIN Users u ON ss.UserId = u.Id
                        WHERE ss.Id = @id AND ss.LeagueId = @leagueId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Standing not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    SELECT ss.*, u.Username, u.FirstName, u.LastName,
                           CAST(ss.TotalCorrectPicks AS FLOAT) / NULLIF(ss.TotalPicks, 0) * 100 AS WinPercentage
                    FROM SeasonStandings ss
                    INNER JOIN Users u ON ss.UserId = u.Id
                    WHERE ss.LeagueId = @leagueId
                    ORDER BY ss.TotalPoints DESC, ss.TotalCorrectPicks DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching season standings:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET user's standings across leagues
app.http('getUserStandings', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/standings',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT ss.*, l.Name AS LeagueName, l.SeasonYear, l.Sport
                    FROM SeasonStandings ss
                    INNER JOIN Leagues l ON ss.LeagueId = l.Id
                    WHERE ss.UserId = @userId AND l.IsActive = 1
                    ORDER BY l.SeasonYear DESC, ss.TotalPoints DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching user standings:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE or UPDATE season standing (upsert)
app.http('upsertSeasonStanding', {
    methods: ['POST', 'PUT'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/standings',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const body = await request.json();

            const { userId, totalPoints, weeksParticipated, totalCorrectPicks, totalPicks, averagePointsPerWeek, rank } = body;

            if (!userId) {
                return { status: 400, jsonBody: { error: 'userId is required' } };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('totalPoints', sql.Decimal(10, 2), totalPoints || 0)
                .input('weeksParticipated', sql.Int, weeksParticipated || 0)
                .input('totalCorrectPicks', sql.Int, totalCorrectPicks || 0)
                .input('totalPicks', sql.Int, totalPicks || 0)
                .input('averagePointsPerWeek', sql.Decimal(10, 2), averagePointsPerWeek || null)
                .input('rank', sql.Int, rank || null)
                .query(`
                    MERGE SeasonStandings AS target
                    USING (SELECT @leagueId AS LeagueId, @userId AS UserId) AS source
                    ON target.LeagueId = source.LeagueId AND target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET TotalPoints = @totalPoints,
                                   WeeksParticipated = @weeksParticipated,
                                   TotalCorrectPicks = @totalCorrectPicks,
                                   TotalPicks = @totalPicks,
                                   AveragePointsPerWeek = @averagePointsPerWeek,
                                   Rank = @rank,
                                   UpdatedAt = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (LeagueId, UserId, TotalPoints, WeeksParticipated, TotalCorrectPicks, TotalPicks, AveragePointsPerWeek, Rank)
                        VALUES (@leagueId, @userId, @totalPoints, @weeksParticipated, @totalCorrectPicks, @totalPicks, @averagePointsPerWeek, @rank)
                    OUTPUT INSERTED.*;
                `);

            return { status: 200, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error upserting season standing:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// Calculate and update all season standings for a league
app.http('calculateSeasonStandings', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/standings/calculate',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;

            await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    -- Aggregate scores across all competitions in the league
                    MERGE SeasonStandings AS target
                    USING (
                        SELECT
                            @leagueId AS LeagueId,
                            s.UserId,
                            SUM(s.TotalPoints) AS TotalPoints,
                            COUNT(DISTINCT s.CompetitionId) AS WeeksParticipated,
                            SUM(s.CorrectPicks) AS TotalCorrectPicks,
                            SUM(s.TotalPicks) AS TotalPicks,
                            AVG(s.TotalPoints) AS AveragePointsPerWeek
                        FROM Scores s
                        INNER JOIN Competitions c ON s.CompetitionId = c.Id
                        WHERE c.LeagueId = @leagueId AND c.Status = 'Completed'
                        GROUP BY s.UserId
                    ) AS source
                    ON target.LeagueId = source.LeagueId AND target.UserId = source.UserId
                    WHEN MATCHED THEN
                        UPDATE SET TotalPoints = source.TotalPoints,
                                   WeeksParticipated = source.WeeksParticipated,
                                   TotalCorrectPicks = source.TotalCorrectPicks,
                                   TotalPicks = source.TotalPicks,
                                   AveragePointsPerWeek = source.AveragePointsPerWeek,
                                   UpdatedAt = GETUTCDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (LeagueId, UserId, TotalPoints, WeeksParticipated, TotalCorrectPicks, TotalPicks, AveragePointsPerWeek)
                        VALUES (source.LeagueId, source.UserId, source.TotalPoints, source.WeeksParticipated, source.TotalCorrectPicks, source.TotalPicks, source.AveragePointsPerWeek);

                    -- Update ranks
                    WITH RankedStandings AS (
                        SELECT Id, RANK() OVER (ORDER BY TotalPoints DESC, TotalCorrectPicks DESC) AS NewRank
                        FROM SeasonStandings
                        WHERE LeagueId = @leagueId
                    )
                    UPDATE ss
                    SET Rank = r.NewRank
                    FROM SeasonStandings ss
                    INNER JOIN RankedStandings r ON ss.Id = r.Id;
                `);

            // Return updated standings
            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    SELECT ss.*, u.Username, u.FirstName, u.LastName
                    FROM SeasonStandings ss
                    INNER JOIN Users u ON ss.UserId = u.Id
                    WHERE ss.LeagueId = @leagueId
                    ORDER BY ss.Rank ASC
                `);

            return { jsonBody: { message: 'Season standings calculated successfully', standings: result.recordset } };
        } catch (err) {
            context.error('Error calculating season standings:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE season standing
app.http('deleteSeasonStanding', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/standings/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    DELETE FROM SeasonStandings
                    OUTPUT DELETED.Id
                    WHERE Id = @id AND LeagueId = @leagueId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Standing not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting season standing:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
