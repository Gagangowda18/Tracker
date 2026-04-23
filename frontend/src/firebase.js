import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAKHNyLMD0ybReyhAhT7OKp0UgouV5wIlE",
    authDomain: "tracker-714d7.firebaseapp.com",
    projectId: "tracker-714d7",
    storageBucket: "tracker-714d7.firebasestorage.app",
    messagingSenderId: "736943772195",
    appId: "1:736943772195:web:9ae7900797841d85e29796"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);
