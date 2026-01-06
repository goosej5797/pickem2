const { app } = require('@azure/functions');
const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');

app.http('testSqlConnection', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Testing SQL Server connection...');
        try {
        const cred = new DefaultAzureCredential();
        const tokenResponse = await cred.getToken('https://database.windows.net/.default');
        const config = {
            server: process.env.DB_SERVER, // e.g., "yourserver.database.windows.net"
            database: process.env.DB_DBNAME,
            authentication: {
                type: 'azure-active-directory-access-token',
                options: {
                    token: tokenResponse.token
                }
            },
            options: {
                encrypt: true // Use encryption for security
            }
        };

        const pool = await sql.connect(config);
        await sql.query`SELECT 1 AS test`;
        await sql.close();
        console.log("Connected to SQL database successfully with managed identity.");
        await pool.close();
        return {
            status: 200,
            body: "SQL connection successful!"
        }
    } catch (err) {
        console.error("Error connecting to SQL database:", err);
        return {
            status: 500,
            body: "SQL connection failed: " + err.message
        }
    }
    }
});
