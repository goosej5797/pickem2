const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET picks for a competition or user
app.http('getCompetitionPicks', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/picks/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;
            const userId = request.query.get('userId');

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .input('competitionId', sql.UniqueIdentifier, competitionId)
                    .query(`
                        SELECT p.*, g.HomeTeam, g.AwayTeam, g.GameDate, g.Status AS GameStatus,
                               u.Username
                        FROM Picks p
                        INNER JOIN Games g ON p.GameId = g.Id
                        INNER JOIN Users u ON p.UserId = u.Id
                        WHERE p.Id = @id AND p.CompetitionId = @competitionId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Pick not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            let query = `
                SELECT p.*, g.HomeTeam, g.AwayTeam, g.GameDate, g.Status AS GameStatus,
                       u.Username
                FROM Picks p
                INNER JOIN Games g ON p.GameId = g.Id
                INNER JOIN Users u ON p.UserId = u.Id
                WHERE p.CompetitionId = @competitionId
            `;

            const req = pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId);

            if (userId) {
                query += ' AND p.UserId = @userId';
                req.input('userId', sql.UniqueIdentifier, userId);
            }

            query += ' ORDER BY g.GameDate ASC, p.ConfidencePoints DESC';

            const result = await req.query(query);
            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching picks:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET user's picks
app.http('getUserPicks', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/picks',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;
            const competitionId = request.query.get('competitionId');

            let query = `
                SELECT p.*, g.HomeTeam, g.AwayTeam, g.GameDate, g.Status AS GameStatus,
                       c.Name AS CompetitionName, c.WeekNumber
                FROM Picks p
                INNER JOIN Games g ON p.GameId = g.Id
                INNER JOIN Competitions c ON p.CompetitionId = c.Id
                WHERE p.UserId = @userId
            `;

            const req = pool.request()
                .input('userId', sql.UniqueIdentifier, userId);

            if (competitionId) {
                query += ' AND p.CompetitionId = @competitionId';
                req.input('competitionId', sql.UniqueIdentifier, competitionId);
            }

            query += ' ORDER BY c.WeekNumber DESC, g.GameDate ASC';

            const result = await req.query(query);
            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching user picks:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE pick
app.http('createPick', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/picks',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const body = await request.json();

            const { gameId, userId, pickedTeam, confidencePoints, pickType, additionalData } = body;

            if (!gameId || !userId || !pickedTeam) {
                return { status: 400, jsonBody: { error: 'gameId, userId, and pickedTeam are required' } };
            }

            // Check if competition is still accepting picks (not locked)
            const lockCheck = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT LockDate, Status
                    FROM Competitions
                    WHERE Id = @competitionId
                `);

            if (lockCheck.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Competition not found' } };
            }

            const competition = lockCheck.recordset[0];
            if (new Date() > new Date(competition.LockDate) || competition.Status === 'Locked' || competition.Status === 'Completed') {
                return { status: 403, jsonBody: { error: 'Competition is locked, no more picks allowed' } };
            }

            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .input('gameId', sql.UniqueIdentifier, gameId)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('pickedTeam', sql.NVarChar(100), pickedTeam)
                .input('confidencePoints', sql.Int, confidencePoints || 1)
                .input('pickType', sql.NVarChar(20), pickType || 'Straight')
                .input('additionalData', sql.NVarChar(sql.MAX), additionalData ? JSON.stringify(additionalData) : null)
                .query(`
                    INSERT INTO Picks (CompetitionId, GameId, UserId, PickedTeam, ConfidencePoints, PickType, AdditionalData)
                    OUTPUT INSERTED.*
                    VALUES (@competitionId, @gameId, @userId, @pickedTeam, @confidencePoints, @pickType, @additionalData)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating pick:', err);
            if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
                return { status: 409, jsonBody: { error: 'User has already made a pick for this game' } };
            }
            if (err.message.includes('CHECK')) {
                return { status: 400, jsonBody: { error: 'Confidence points must be between 1 and 20' } };
            }
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE pick
app.http('updatePick', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/picks/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;
            const body = await request.json();

            // Check if competition is still accepting picks
            const lockCheck = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT LockDate, Status
                    FROM Competitions
                    WHERE Id = @competitionId
                `);

            if (lockCheck.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Competition not found' } };
            }

            const competition = lockCheck.recordset[0];
            if (new Date() > new Date(competition.LockDate) || competition.Status === 'Locked' || competition.Status === 'Completed') {
                return { status: 403, jsonBody: { error: 'Competition is locked, picks cannot be modified' } };
            }

            const { pickedTeam, confidencePoints, pickType, additionalData } = body;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .input('pickedTeam', sql.NVarChar(100), pickedTeam)
                .input('confidencePoints', sql.Int, confidencePoints)
                .input('pickType', sql.NVarChar(20), pickType)
                .input('additionalData', sql.NVarChar(sql.MAX), additionalData ? JSON.stringify(additionalData) : null)
                .query(`
                    UPDATE Picks
                    SET PickedTeam = COALESCE(@pickedTeam, PickedTeam),
                        ConfidencePoints = COALESCE(@confidencePoints, ConfidencePoints),
                        PickType = COALESCE(@pickType, PickType),
                        AdditionalData = COALESCE(@additionalData, AdditionalData),
                        UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.*
                    WHERE Id = @id AND CompetitionId = @competitionId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Pick not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating pick:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE pick
app.http('deletePick', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/picks/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;

            // Check if competition is still accepting picks
            const lockCheck = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT LockDate, Status
                    FROM Competitions
                    WHERE Id = @competitionId
                `);

            if (lockCheck.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Competition not found' } };
            }

            const competition = lockCheck.recordset[0];
            if (new Date() > new Date(competition.LockDate) || competition.Status === 'Locked' || competition.Status === 'Completed') {
                return { status: 403, jsonBody: { error: 'Competition is locked, picks cannot be deleted' } };
            }

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    DELETE FROM Picks
                    OUTPUT DELETED.Id
                    WHERE Id = @id AND CompetitionId = @competitionId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Pick not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting pick:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
