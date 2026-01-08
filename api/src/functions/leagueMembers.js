const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET league members
app.http('getLeagueMembers', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/members/{id?}',
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
                        SELECT lm.*, u.Username, u.FirstName, u.LastName, u.Email
                        FROM LeagueMembers lm
                        INNER JOIN Users u ON lm.UserId = u.Id
                        WHERE lm.Id = @id AND lm.LeagueId = @leagueId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'League member not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    SELECT lm.*, u.Username, u.FirstName, u.LastName
                    FROM LeagueMembers lm
                    INNER JOIN Users u ON lm.UserId = u.Id
                    WHERE lm.LeagueId = @leagueId AND lm.IsActive = 1
                    ORDER BY lm.JoinedAt ASC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching league members:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET user's leagues
app.http('getUserLeagues', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/leagues',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT l.*, lm.DisplayName, lm.JoinedAt,
                           (SELECT COUNT(*) FROM LeagueMembers WHERE LeagueId = l.Id AND IsActive = 1) AS MemberCount
                    FROM Leagues l
                    INNER JOIN LeagueMembers lm ON l.Id = lm.LeagueId
                    WHERE lm.UserId = @userId AND lm.IsActive = 1 AND l.IsActive = 1
                    ORDER BY lm.JoinedAt DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching user leagues:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE league member (join league)
app.http('createLeagueMember', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/members',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const body = await request.json();

            const { userId, displayName } = body;

            if (!userId) {
                return { status: 400, jsonBody: { error: 'userId is required' } };
            }

            // Check if league is at capacity
            const capacityCheck = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    SELECT l.MaxMembers,
                           (SELECT COUNT(*) FROM LeagueMembers WHERE LeagueId = l.Id AND IsActive = 1) AS CurrentMembers
                    FROM Leagues l
                    WHERE l.Id = @leagueId AND l.IsActive = 1
                `);

            if (capacityCheck.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League not found' } };
            }

            const { MaxMembers, CurrentMembers } = capacityCheck.recordset[0];
            if (CurrentMembers >= MaxMembers) {
                return { status: 409, jsonBody: { error: 'League is at maximum capacity' } };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('displayName', sql.NVarChar(100), displayName || null)
                .query(`
                    INSERT INTO LeagueMembers (LeagueId, UserId, DisplayName)
                    OUTPUT INSERTED.*
                    VALUES (@leagueId, @userId, @displayName)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating league member:', err);
            if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
                return { status: 409, jsonBody: { error: 'User is already a member of this league' } };
            }
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE league member
app.http('updateLeagueMember', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/members/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;
            const body = await request.json();

            const { displayName, isActive } = body;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('displayName', sql.NVarChar(100), displayName)
                .input('isActive', sql.Bit, isActive)
                .query(`
                    UPDATE LeagueMembers
                    SET DisplayName = COALESCE(@displayName, DisplayName),
                        IsActive = COALESCE(@isActive, IsActive)
                    OUTPUT INSERTED.*
                    WHERE Id = @id AND LeagueId = @leagueId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League member not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating league member:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE league member (leave league)
app.http('deleteLeagueMember', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/members/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .query(`
                    UPDATE LeagueMembers
                    SET IsActive = 0
                    OUTPUT INSERTED.Id
                    WHERE Id = @id AND LeagueId = @leagueId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League member not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting league member:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
