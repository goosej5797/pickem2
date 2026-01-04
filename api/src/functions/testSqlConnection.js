const { app } = require('@azure/functions');
const sql = require('mssql');

app.http('testSqlConnection', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Testing SQL Server connection...');

        const connectionString = process.env.SQLCONNSTR_sql_conn_string;

        if (!connectionString) {
            context.log('Connection string not found');
            return {
                status: 500,
                jsonBody: {
                    success: false,
                    message: 'Connection string "sql_conn_string" is not configured'
                }
            };
        }

        try {
            await sql.connect(connectionString);
            await sql.query`SELECT 1 AS test`;
            await sql.close();

            context.log('SQL connection test successful');
            return {
                status: 200,
                jsonBody: {
                    success: true,
                    message: 'Successfully connected to the database'
                }
            };
        } catch (err) {
            context.log(`SQL connection test failed: ${err.message}`);
            await sql.close();
            return {
                status: 500,
                jsonBody: {
                    success: false,
                    message: `Failed to connect to database: ${err.message}`
                }
            };
        }
    }
});
