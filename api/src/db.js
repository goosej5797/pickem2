const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');

let pool = null;
let tokenExpiry = null;

async function getConnection() {
    const now = Date.now();

    // Check if we need a new connection (no pool or token expired)
    if (!pool || (tokenExpiry && now >= tokenExpiry - 60000)) {
        if (pool) {
            await pool.close();
        }

        const cred = new DefaultAzureCredential();
        const tokenResponse = await cred.getToken('https://database.windows.net/.default');

        // Token typically expires in 1 hour
        tokenExpiry = now + (60 * 60 * 1000);

        const config = {
            server: process.env.DB_SERVER,
            database: process.env.DB_DBNAME,
            authentication: {
                type: 'azure-active-directory-access-token',
                options: {
                    token: tokenResponse.token
                }
            },
            options: {
                encrypt: true,
                trustServerCertificate: false
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };

        pool = await sql.connect(config);
    }

    return pool;
}

async function closeConnection() {
    if (pool) {
        await pool.close();
        pool = null;
        tokenExpiry = null;
    }
}

module.exports = {
    getConnection,
    closeConnection,
    sql
};
