const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET competitions for a league
app.http('getCompetitions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/competitions/{id?}',
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
                        SELECT c.*,
                               (SELECT COUNT(*) FROM Games WHERE CompetitionId = c.Id) AS GameCount
                        FROM Competitions c
                        WHERE c.Id = @id AND c.LeagueId = @leagueId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Competition not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    SELECT c.*,
                           (SELECT COUNT(*) FROM Games WHERE CompetitionId = c.Id) AS GameCount
                    FROM Competitions c
                    WHERE c.LeagueId = @leagueId
                    ORDER BY c.WeekNumber ASC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching competitions:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE competition
app.http('createCompetition', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/competitions',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const body = await request.json();

            const { weekNumber, name, description, startDate, endDate, lockDate, competitionType } = body;

            if (!weekNumber || !name || !startDate || !endDate || !lockDate) {
                return { status: 400, jsonBody: { error: 'weekNumber, name, startDate, endDate, and lockDate are required' } };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('weekNumber', sql.Int, weekNumber)
                .input('name', sql.NVarChar(100), name)
                .input('description', sql.NVarChar(500), description || null)
                .input('startDate', sql.DateTime2, new Date(startDate))
                .input('endDate', sql.DateTime2, new Date(endDate))
                .input('lockDate', sql.DateTime2, new Date(lockDate))
                .input('competitionType', sql.NVarChar(50), competitionType || 'Standard')
                .query(`
                    INSERT INTO Competitions (LeagueId, WeekNumber, Name, Description, StartDate, EndDate, LockDate, CompetitionType)
                    OUTPUT INSERTED.*
                    VALUES (@leagueId, @weekNumber, @name, @description, @startDate, @endDate, @lockDate, @competitionType)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating competition:', err);
            if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
                return { status: 409, jsonBody: { error: 'Competition for this week already exists' } };
            }
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE competition
app.http('updateCompetition', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/competitions/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;
            const body = await request.json();

            const { name, description, startDate, endDate, lockDate, status, competitionType, scoringCalculated } = body;

            const req = pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('name', sql.NVarChar(100), name)
                .input('description', sql.NVarChar(500), description)
                .input('status', sql.NVarChar(20), status)
                .input('competitionType', sql.NVarChar(50), competitionType)
                .input('scoringCalculated', sql.Bit, scoringCalculated);

            if (startDate) req.input('startDate', sql.DateTime2, new Date(startDate));
            else req.input('startDate', sql.DateTime2, null);

            if (endDate) req.input('endDate', sql.DateTime2, new Date(endDate));
            else req.input('endDate', sql.DateTime2, null);

            if (lockDate) req.input('lockDate', sql.DateTime2, new Date(lockDate));
            else req.input('lockDate', sql.DateTime2, null);

            const result = await req.query(`
                UPDATE Competitions
                SET Name = COALESCE(@name, Name),
                    Description = COALESCE(@description, Description),
                    StartDate = COALESCE(@startDate, StartDate),
                    EndDate = COALESCE(@endDate, EndDate),
                    LockDate = COALESCE(@lockDate, LockDate),
                    Status = COALESCE(@status, Status),
                    CompetitionType = COALESCE(@competitionType, CompetitionType),
                    ScoringCalculated = COALESCE(@scoringCalculated, ScoringCalculated),
                    UpdatedAt = GETUTCDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND LeagueId = @leagueId
            `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Competition not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating competition:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE competition
app.http('deleteCompetition', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/competitions/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    UPDATE Competitions
                    SET Status = 'Cancelled', UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.Id
                    WHERE Id = @id AND LeagueId = @leagueId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Competition not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting competition:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
