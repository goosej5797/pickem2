const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET all users or single user by ID
app.http('getUsers', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .query(`
                        SELECT Id, Email, Username, FirstName, LastName,
                               IsActive, IsPremium, CreatedAt, UpdatedAt, LastLoginAt
                        FROM Users
                        WHERE Id = @id
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'User not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            const result = await pool.request()
                .query(`
                    SELECT Id, Email, Username, FirstName, LastName,
                           IsActive, IsPremium, CreatedAt, UpdatedAt, LastLoginAt
                    FROM Users
                    WHERE IsActive = 1
                    ORDER BY CreatedAt DESC
                `);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching users:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE user
app.http('createUser', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const body = await request.json();

            const { email, username, passwordHash, firstName, lastName, isPremium } = body;

            if (!email || !username || !passwordHash) {
                return { status: 400, jsonBody: { error: 'Email, username, and passwordHash are required' } };
            }

            const result = await pool.request()
                .input('email', sql.NVarChar(255), email)
                .input('username', sql.NVarChar(50), username)
                .input('passwordHash', sql.NVarChar(255), passwordHash)
                .input('firstName', sql.NVarChar(100), firstName || null)
                .input('lastName', sql.NVarChar(100), lastName || null)
                .input('isPremium', sql.Bit, isPremium || false)
                .query(`
                    INSERT INTO Users (Email, Username, PasswordHash, FirstName, LastName, IsPremium)
                    OUTPUT INSERTED.*
                    VALUES (@email, @username, @passwordHash, @firstName, @lastName, @isPremium)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating user:', err);
            if (err.message.includes('UNIQUE')) {
                return { status: 409, jsonBody: { error: 'Email or username already exists' } };
            }
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE user
app.http('updateUser', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'users/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;
            const body = await request.json();

            const { email, username, firstName, lastName, isActive, isPremium } = body;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('email', sql.NVarChar(255), email)
                .input('username', sql.NVarChar(50), username)
                .input('firstName', sql.NVarChar(100), firstName)
                .input('lastName', sql.NVarChar(100), lastName)
                .input('isActive', sql.Bit, isActive)
                .input('isPremium', sql.Bit, isPremium)
                .query(`
                    UPDATE Users
                    SET Email = COALESCE(@email, Email),
                        Username = COALESCE(@username, Username),
                        FirstName = COALESCE(@firstName, FirstName),
                        LastName = COALESCE(@lastName, LastName),
                        IsActive = COALESCE(@isActive, IsActive),
                        IsPremium = COALESCE(@isPremium, IsPremium),
                        UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.*
                    WHERE Id = @id
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'User not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating user:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE user (soft delete)
app.http('deleteUser', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'users/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .query(`
                    UPDATE Users
                    SET IsActive = 0, UpdatedAt = GETUTCDATE()
                    OUTPUT INSERTED.Id
                    WHERE Id = @id
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'User not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting user:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
