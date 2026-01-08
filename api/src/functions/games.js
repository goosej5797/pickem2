const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET games for a competition
app.http('getGames', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/games/{id?}',
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
                        SELECT *
                        FROM Games
                        WHERE Id = @id AND CompetitionId = @competitionId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Game not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    SELECT *
                    FROM Games
                    WHERE CompetitionId = @competitionId
                    ORDER BY GameDate ASC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching games:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE game
app.http('createGame', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/games',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const body = await request.json();

            const {
                externalGameId, homeTeam, awayTeam, gameDate, venue,
                spreadLine, overUnderLine, homeMoneyline, awayMoneyline
            } = body;

            if (!homeTeam || !awayTeam || !gameDate) {
                return { status: 400, jsonBody: { error: 'homeTeam, awayTeam, and gameDate are required' } };
            }

            const result = await pool.request()
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .input('externalGameId', sql.NVarChar(100), externalGameId || null)
                .input('homeTeam', sql.NVarChar(100), homeTeam)
                .input('awayTeam', sql.NVarChar(100), awayTeam)
                .input('gameDate', sql.DateTime2, new Date(gameDate))
                .input('venue', sql.NVarChar(200), venue || null)
                .input('spreadLine', sql.Decimal(5, 2), spreadLine || null)
                .input('overUnderLine', sql.Decimal(5, 2), overUnderLine || null)
                .input('homeMoneyline', sql.Int, homeMoneyline || null)
                .input('awayMoneyline', sql.Int, awayMoneyline || null)
                .query(`
                    INSERT INTO Games (CompetitionId, ExternalGameId, HomeTeam, AwayTeam, GameDate, Venue, SpreadLine, OverUnderLine, HomeMoneyline, AwayMoneyline)
                    OUTPUT INSERTED.*
                    VALUES (@competitionId, @externalGameId, @homeTeam, @awayTeam, @gameDate, @venue, @spreadLine, @overUnderLine, @homeMoneyline, @awayMoneyline)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating game:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE game
app.http('updateGame', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/games/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;
            const body = await request.json();

            const {
                homeTeam, awayTeam, homeTeamScore, awayTeamScore, gameDate, venue, status,
                spreadLine, overUnderLine, homeMoneyline, awayMoneyline
            } = body;

            const req = pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .input('homeTeam', sql.NVarChar(100), homeTeam)
                .input('awayTeam', sql.NVarChar(100), awayTeam)
                .input('homeTeamScore', sql.Int, homeTeamScore)
                .input('awayTeamScore', sql.Int, awayTeamScore)
                .input('venue', sql.NVarChar(200), venue)
                .input('status', sql.NVarChar(20), status)
                .input('spreadLine', sql.Decimal(5, 2), spreadLine)
                .input('overUnderLine', sql.Decimal(5, 2), overUnderLine)
                .input('homeMoneyline', sql.Int, homeMoneyline)
                .input('awayMoneyline', sql.Int, awayMoneyline);

            if (gameDate) req.input('gameDate', sql.DateTime2, new Date(gameDate));
            else req.input('gameDate', sql.DateTime2, null);

            const result = await req.query(`
                UPDATE Games
                SET HomeTeam = COALESCE(@homeTeam, HomeTeam),
                    AwayTeam = COALESCE(@awayTeam, AwayTeam),
                    HomeTeamScore = COALESCE(@homeTeamScore, HomeTeamScore),
                    AwayTeamScore = COALESCE(@awayTeamScore, AwayTeamScore),
                    GameDate = COALESCE(@gameDate, GameDate),
                    Venue = COALESCE(@venue, Venue),
                    Status = COALESCE(@status, Status),
                    SpreadLine = COALESCE(@spreadLine, SpreadLine),
                    OverUnderLine = COALESCE(@overUnderLine, OverUnderLine),
                    HomeMoneyline = COALESCE(@homeMoneyline, HomeMoneyline),
                    AwayMoneyline = COALESCE(@awayMoneyline, AwayMoneyline),
                    UpdatedAt = GETUTCDATE()
                OUTPUT INSERTED.*
                WHERE Id = @id AND CompetitionId = @competitionId
            `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Game not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating game:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE game
app.http('deleteGame', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'competitions/{competitionId}/games/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const competitionId = request.params.competitionId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('competitionId', sql.UniqueIdentifier, competitionId)
                .query(`
                    UPDATE Games
                    SET Status = 'Cancelled', UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.Id
                    WHERE Id = @id AND CompetitionId = @competitionId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Game not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting game:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
