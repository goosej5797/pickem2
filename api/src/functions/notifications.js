const { app } = require('@azure/functions');
const { getConnection, sql } = require('../db');

// GET notifications for a user
app.http('getNotifications', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications/{id?}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;
            const id = request.params.id;
            const unreadOnly = request.query.get('unreadOnly') === 'true';
            const limit = parseInt(request.query.get('limit')) || 50;

            if (id) {
                const result = await pool.request()
                    .input('id', sql.UniqueIdentifier, id)
                    .input('userId', sql.UniqueIdentifier, userId)
                    .query(`
                        SELECT *
                        FROM Notifications
                        WHERE Id = @id AND UserId = @userId
                    `);

                if (result.recordset.length === 0) {
                    return { status: 404, jsonBody: { error: 'Notification not found' } };
                }
                return { jsonBody: result.recordset[0] };
            }

            let query = `
                SELECT TOP (@limit) *
                FROM Notifications
                WHERE UserId = @userId
            `;

            if (unreadOnly) {
                query += ' AND IsRead = 0';
            }

            query += ' ORDER BY CreatedAt DESC';

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('limit', sql.Int, limit)
                .query(query);

            return { jsonBody: result.recordset };
        } catch (err) {
            context.error('Error fetching notifications:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// GET unread notification count
app.http('getUnreadNotificationCount', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications/count',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    SELECT COUNT(*) AS UnreadCount
                    FROM Notifications
                    WHERE UserId = @userId AND IsRead = 0
                `);

            return { jsonBody: { unreadCount: result.recordset[0].UnreadCount } };
        } catch (err) {
            context.error('Error fetching notification count:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE notification
app.http('createNotification', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;
            const body = await request.json();

            const { type, title, message, relatedEntityId, relatedEntityType } = body;

            if (!type || !title || !message) {
                return { status: 400, jsonBody: { error: 'type, title, and message are required' } };
            }

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .input('type', sql.NVarChar(50), type)
                .input('title', sql.NVarChar(200), title)
                .input('message', sql.NVarChar(1000), message)
                .input('relatedEntityId', sql.UniqueIdentifier, relatedEntityId || null)
                .input('relatedEntityType', sql.NVarChar(50), relatedEntityType || null)
                .query(`
                    INSERT INTO Notifications (UserId, Type, Title, Message, RelatedEntityId, RelatedEntityType)
                    OUTPUT INSERTED.*
                    VALUES (@userId, @type, @title, @message, @relatedEntityId, @relatedEntityType)
                `);

            return { status: 201, jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error creating notification:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// CREATE bulk notifications (for all league members)
app.http('createBulkNotifications', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'leagues/{leagueId}/notifications',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const leagueId = request.params.leagueId;
            const body = await request.json();

            const { type, title, message, relatedEntityId, relatedEntityType } = body;

            if (!type || !title || !message) {
                return { status: 400, jsonBody: { error: 'type, title, and message are required' } };
            }

            const result = await pool.request()
                .input('leagueId', sql.UniqueIdentifier, leagueId)
                .input('type', sql.NVarChar(50), type)
                .input('title', sql.NVarChar(200), title)
                .input('message', sql.NVarChar(1000), message)
                .input('relatedEntityId', sql.UniqueIdentifier, relatedEntityId || null)
                .input('relatedEntityType', sql.NVarChar(50), relatedEntityType || null)
                .query(`
                    INSERT INTO Notifications (UserId, Type, Title, Message, RelatedEntityId, RelatedEntityType)
                    OUTPUT INSERTED.*
                    SELECT lm.UserId, @type, @title, @message, @relatedEntityId, @relatedEntityType
                    FROM LeagueMembers lm
                    WHERE lm.LeagueId = @leagueId AND lm.IsActive = 1
                `);

            return { status: 201, jsonBody: { message: 'Notifications created', count: result.recordset.length } };
        } catch (err) {
            context.error('Error creating bulk notifications:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// UPDATE notification (mark as read)
app.http('updateNotification', {
    methods: ['PUT', 'PATCH'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;
            const id = request.params.id;
            const body = await request.json();

            const { isRead } = body;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('isRead', sql.Bit, isRead)
                .query(`
                    UPDATE Notifications
                    SET IsRead = COALESCE(@isRead, IsRead),
                        ReadAt = CASE WHEN @isRead = 1 THEN GETUTCDATE() ELSE ReadAt END
                    OUTPUT INSERTED.*
                    WHERE Id = @id AND UserId = @userId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Notification not found' } };
            }

            return { jsonBody: result.recordset[0] };
        } catch (err) {
            context.error('Error updating notification:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// Mark all notifications as read
app.http('markAllNotificationsRead', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications/mark-all-read',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;

            const result = await pool.request()
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    UPDATE Notifications
                    SET IsRead = 1, ReadAt = GETUTCDATE()
                    OUTPUT INSERTED.Id
                    WHERE UserId = @userId AND IsRead = 0
                `);

            return { jsonBody: { message: 'All notifications marked as read', count: result.recordset.length } };
        } catch (err) {
            context.error('Error marking notifications as read:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE notification
app.http('deleteNotification', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'users/{userId}/notifications/{id}',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const userId = request.params.userId;
            const id = request.params.id;

            const result = await pool.request()
                .input('id', sql.UniqueIdentifier, id)
                .input('userId', sql.UniqueIdentifier, userId)
                .query(`
                    DELETE FROM Notifications
                    OUTPUT DELETED.Id
                    WHERE Id = @id AND UserId = @userId
                `);

            if (result.recordset.length === 0) {
                return { status: 404, jsonBody: { error: 'Notification not found' } };
            }

            return { status: 204 };
        } catch (err) {
            context.error('Error deleting notification:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});

// DELETE old read notifications (cleanup)
app.http('cleanupNotifications', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'notifications/cleanup',
    handler: async (request, context) => {
        try {
            const pool = await getConnection();
            const daysOld = parseInt(request.query.get('daysOld')) || 30;

            const result = await pool.request()
                .input('daysOld', sql.Int, daysOld)
                .query(`
                    DELETE FROM Notifications
                    OUTPUT DELETED.Id
                    WHERE IsRead = 1 AND ReadAt < DATEADD(DAY, -@daysOld, GETUTCDATE())
                `);

            return { jsonBody: { message: 'Old notifications cleaned up', count: result.recordset.length } };
        } catch (err) {
            context.error('Error cleaning up notifications:', err);
            return { status: 500, jsonBody: { error: err.message } };
        }
    }
});
