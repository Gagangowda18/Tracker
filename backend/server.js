require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, verifyToken } = require('./config/firebaseAdmin');
const { parseExpensesFromEmail } = require('./services/gmailService');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send('Expense Tracker API is running...');
});

// Email Sync Route
app.post('/api/sync-emails', verifyToken, async (req, res) => {
    try {
        const { googleToken } = req.body;
        const userId = req.user.uid;

        if (!googleToken) return res.status(400).json({ error: 'Google token required' });

        const transactions = await parseExpensesFromEmail(userId, googleToken);

        if (db) {
            console.log("📂 [Firestore] Fetching existing transactions for de-duplication...");
            // Smart De-duplication: Fetch existing transactions to check against
            const existingSnapshot = await db.collection('transactions')
                .where('userId', '==', userId)
                .get();
            console.log(`✅ [Firestore] Found ${existingSnapshot.size} existing transactions.`);

            const existingKeys = new Set();
            existingSnapshot.forEach(doc => {
                const data = doc.data();
                // Create a unique signature: Amount_Date (normalized to second)
                const dateKey = new Date(data.date).getTime();
                existingKeys.add(`${data.amount}_${dateKey}`);
            });

            const batch = db.batch();
            let addedCount = 0;

            console.log(`🔍 [Firestore] Checking ${transactions.length} parsed transactions for duplicates...`);

            transactions.forEach(tx => {
                try {
                    const txDateKey = new Date(tx.date).getTime();
                    const txSignature = `${tx.amount}_${txDateKey}`;

                    // Only add if signature doesn't exist already
                    if (!existingKeys.has(txSignature)) {
                        const txRef = db.collection('transactions').doc(tx.id);
                        batch.set(txRef, { ...tx, createdAt: new Date() }, { merge: true });
                        addedCount++;
                        existingKeys.add(txSignature); // Prevent duplicates within the same batch
                    }
                } catch (txErr) {
                    console.error("❌ [Firestore] Error processing individual transaction:", txErr, tx);
                }
            });

            if (addedCount > 0) {
                console.log(`📤 [Firestore] Committing batch for ${addedCount} new transactions...`);
                try {
                    await batch.commit();
                    console.log("✅ [Firestore] Batch commit successful.");
                } catch (batchErr) {
                    console.error("❌ [Firestore] Batch commit FAILED:", batchErr);
                    throw batchErr;
                }
            } else {
                console.log("ℹ️ [Firestore] No new transactions to add.");
            }
            return res.json({ message: `Synced ${addedCount} new transactions`, transactions });
        }

        res.json({ message: `Synced ${transactions.length} transactions (Demo mode)`, transactions });
    } catch (error) {
        console.error("Sync Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Manual Expense Input Route
app.post('/api/transactions', verifyToken, async (req, res) => {
    try {
        const { amount, category, description, date, type } = req.body;
        const userId = req.user.uid;

        if (db) {
            const docRef = await db.collection('transactions').add({
                amount, category, description, date, type, userId, createdAt: new Date()
            });
            return res.status(201).json({ message: 'Transaction added successfully', id: docRef.id });
        }

        res.status(201).json({ message: 'Demo mode: Transaction processed locally', id: 'demo-' + Date.now() });
    } catch (error) {
        console.error("Transaction Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Wipe All Transactions Route
app.delete('/api/transactions', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (db) {
            const snapshot = await db.collection('transactions')
                .where('userId', '==', userId)
                .get();

            if (snapshot.empty) {
                return res.json({ message: 'No transactions to delete' });
            }

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            return res.json({ message: `Successfully deleted ${snapshot.size} transactions` });
        }

        res.json({ message: 'Demo mode: Local data cleared' });
    } catch (error) {
        console.error("Wipe Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Single Transaction Route
app.delete('/api/transactions/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.uid;

        if (db) {
            const docRef = db.collection('transactions').doc(id);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).json({ error: 'Transaction not found' });
            }

            if (doc.data().userId !== userId) {
                return res.status(403).json({ error: 'Unauthorized to delete this transaction' });
            }

            await docRef.delete();
            return res.json({ message: 'Transaction deleted successfully' });
        }

        res.json({ message: 'Demo mode: Transaction deleted locally' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Fetch All Transactions Route
app.get('/api/transactions', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (db) {
            // Simplified query to avoid index requirement
            const snapshot = await db.collection('transactions')
                .where('userId', '==', userId)
                .get();

            const transactions = [];
            snapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });

            // Sort by date in memory
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

            return res.json({ transactions });
        }

        res.json({ transactions: [], message: 'Demo mode: No persistent storage' });
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use by another process.`);
    } else {
        console.error('Server error:', err);
    }
});

process.on('uncaughtException', (err) => {
    console.error('There was an uncaught error', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
