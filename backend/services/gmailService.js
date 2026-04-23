const { google } = require('googleapis');
const { OAuth2 } = google.auth;

const getGmailService = (token) => {
    const oauth2Client = new OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: token });
    return google.gmail({ version: 'v1', auth: oauth2Client });
};

const parseExpensesFromEmail = async (userId, token) => {
    const gmail = getGmailService(token);

    // Calculate date 15 days ago for the query
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const dateQuery = `after:${fifteenDaysAgo.getFullYear()}/${(fifteenDaysAgo.getMonth() + 1).toString().padStart(2, '0')}/${fifteenDaysAgo.getDate().toString().padStart(2, '0')}`;

    // Search for generic receipts and specific bank alerts
    const query = `from:(amazon OR uber OR swiggy OR zomato OR "axis bank" OR "idfc first bank" OR "upi") (receipt OR invoice OR order OR "debited" OR "credited" OR "spent" OR "transaction") ${dateQuery}`;

    console.log("🔍 [Gmail Sync] Starting search with query:", query);

    try {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 100
        });

        const transactions = [];
        const processedIds = new Set();

        if (!res.data.messages || res.data.messages.length === 0) {
            console.log("ℹ️ [Gmail Sync] No matching emails found in your inbox.");
            return []; // Returns empty, no "fake" data anymore
        }

        console.log(`✅ [Gmail Sync] Found ${res.data.messages.length} potential emails. Processing...`);

        for (const msg of res.data.messages) {
            if (processedIds.has(msg.id)) continue;

            const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id });
            const snippet = detail.data.snippet.toLowerCase();

            let content = snippet;
            if (detail.data.payload.parts) {
                const part = detail.data.payload.parts.find(p => p.mimeType === 'text/plain');
                if (part && part.body && part.body.data) {
                    content = Buffer.from(part.body.data, 'base64').toString().toLowerCase();
                }
            } else if (detail.data.payload.body && detail.data.payload.body.data) {
                content = Buffer.from(detail.data.payload.body.data, 'base64').toString().toLowerCase();
            }

            const body = content.toLowerCase();

            let amount = 0;
            let type = 'expense';
            let category = 'Uncategorized';
            let description = snippet.substring(0, 100);

            // Date Extraction
            const transactionDate = new Date(parseInt(detail.data.internalDate)).toISOString();

            const amountRegex = /(?:rs\.?|inr|₹)\s?(\d+(?:\,\d+)*(?:\.\d{1,2})?)/i;
            const creditRegex = /credited|received|added|refund/i;

            const amountMatch = (body.match(amountRegex) || snippet.match(amountRegex));
            if (amountMatch) {
                amount = parseFloat(amountMatch[1].replace(/,/g, ''));
            }

            if (creditRegex.test(body) || creditRegex.test(snippet)) {
                type = 'income';
            }

            if (body.includes('axis bank') || snippet.includes('axis bank')) {
                description = 'Axis Bank: ' + description;
                category = 'Bank Transfer';
            } else if (body.includes('idfc') || snippet.includes('idfc') || body.includes('idfcfirst')) {
                description = 'IDFC Bank: ' + description;
                category = 'Bank Alert';
            } else if (body.includes('amazon')) {
                category = 'Shopping';
            } else if (body.includes('uber')) {
                category = 'Transport';
            } else if (body.includes('swiggy') || body.includes('zomato')) {
                category = 'Food & Drinks';
            } else if (body.includes('upi')) {
                category = 'UPI Payment';
            }

            if (amount > 0) {
                transactions.push({
                    id: msg.id,
                    amount,
                    type,
                    category,
                    source: 'email',
                    description,
                    date: transactionDate,
                    userId
                });
                processedIds.add(msg.id);
            }
        }

        console.log(`📊 [Gmail Sync] Parsed ${transactions.length} valid transactions.`);
        return transactions;

    } catch (error) {
        console.warn("⚠️ [Gmail Sync] API Error:", error.message);
        // Removed the injection of test data here
        return [];
    }
};

module.exports = { parseExpensesFromEmail };
