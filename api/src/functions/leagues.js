const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET all leagues or single league by ID
app.http('getLeagues', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leagues/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .query(`
                        SELECT l.*, u.Username AS AdminUsername
                        FROM Leagues l
                        INNER JOIN Users u ON l.AdminUserId = u.Id
                        WHERE l.Id = @id
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'League not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .query(`
                    SELECT l.*, u.Username AS AdminUsername
                    FROM Leagues l
                    INNER JOIN Users u ON l.AdminUserId = u.Id
                    WHERE l.IsActive = 1
                    ORDER BY l.CreatedAt DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching leagues:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET league by invite code
app.http('getLeagueByInviteCode', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leagues/invite/{inviteCode}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const inviteCode = request.params.inviteCode;

            const result = await pool.request()
                .input('inviteCode', sql.NVarChar(20), inviteCode)
                .query(`
                    SELECT l.Id, l.Name, l.Description, l.Sport, l.SeasonYear,
                           l.MaxMembers, l.IsPublic, u.Username AS AdminUsername,
                           (SELECT COUNT(*) FROM LeagueMembers WHERE LeagueId = l.Id AND IsActive = 1) AS CurrentMembers
                    FROM Leagues l
                    INNER JOIN Users u ON l.AdminUserId = u.Id
                    WHERE l.InviteCode = @inviteCode AND l.IsActive = 1
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League not found' } };
            }
            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error fetching league by invite code:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE league
app.http('createLeague', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'leagues',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const body = await request.json();

            const { name, description, adminUserId, inviteCode, seasonYear, sport, maxMembers, isPublic } = body;

            if (!name || !adminUserId || !inviteCode || !seasonYear) {
                return { status: 400, jsonBody: { error: 'Name, adminUserId, inviteCode, and seasonYear are required' } };
            }

            const result = await pool.request()
                .input('name', sql.NVarChar(100), name)
                .input('description', sql.NVarChar(500), description || null)
                .input('adminUserId', sql.UniqueIdentifier, adminUserId)
                .input('inviteCode', sql.NVarChar(20), inviteCode)
                .input('seasonYear', sql.Int, seasonYear)
                .input('sport', sql.NVarChar(50), sport || 'NFL')
                .input('maxMembers', sql.Int, maxMembers || 20)
                .input('isPublic', sql.Bit, isPublic || false)
                .query(`
                    INSERT INTO Leagues (Name, Description, AdminUserId, InviteCode, SeasonYear, Sport, MaxMembers, IsPublic)
                    OUTPUT INSERTED.*
                    VALUES (@name, @description, @adminUserId, @inviteCode, @seasonYear, @sport, @maxMembers, @isPublic)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating league:', err);
            if (err.message.includes('UNIQUE')) {
                return { status: 409, jsonBody: { error: 'Invite code already exists' } };
            }
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE league
app.http('updateLeague', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'leagues/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;
            const body = await request.json();

            const { name, description, maxMembers, isActive, isPublic } = body;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('name', sql.NVarChar(100), name)
                .input('description', sql.NVarChar(500), description)
                .input('maxMembers', sql.Int, maxMembers)
                .input('isActive', sql.Bit, isActive)
                .input('isPublic', sql.Bit, isPublic)
                .query(`
                    UPDATE Leagues
                    SET Name = COALESCE(@name, Name),
                        Description = COALESCE(@description, Description),
                        MaxMembers = COALESCE(@maxMembers, MaxMembers),
                        IsActive = COALESCE(@isActive, IsActive),
                        IsPublic = COALESCE(@isPublic, IsPublic),
                        UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.*
                    WHERE Id = @id
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating league:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE league (soft delete)
app.http('deleteLeague', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'leagues/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .query(`
                    UPDATE Leagues
                    SET IsActive = 0, UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.Id
                    WHERE Id = @id
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'League not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting league:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
