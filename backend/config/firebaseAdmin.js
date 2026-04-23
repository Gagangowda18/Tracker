const admin = require('firebase-admin');

let db = null;

// Try to load serviceAccountKey.json from local config, then fallback to parent dir (for Render)
try {
    let serviceAccount;
    try {
        serviceAccount = require("./serviceAccountKey.json");
    } catch (err) {
        // Render places secret files in the root folder of the service
        serviceAccount = require("../serviceAccountKey.json");
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("Firebase Admin Initialized Successfully");
} catch (e) {
    console.warn("⚠️ Firebase Admin SDK NOT initialized: serviceAccountKey.json is missing");
    console.warn("Please add it as a secret file in Render or download from Firebase Console.");
}

const verifyToken = async (req, res, next) => {
    // If we're in "demo mode" (no firebase admin), skip token verification for localhost testing
    if (!admin.apps.length) {
        console.log("Skipping Auth check: Admin SDK not initialized.");
        req.user = { uid: "demo-user" };
        return next();
    }

    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) return res.status(401).json({ error: "Unauthorized" });

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(401).json({ error: "Invalid token" });
    }
};

module.exports = { admin, db, verifyToken };
