import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig, ALLOWED_EMAIL } from "./firebase-config.js";

export const isConfigured = !/REPLACE_WITH/.test(JSON.stringify(firebaseConfig));

export function isAllowedEmail(email) {
    return typeof email === "string" && email.trim().toLowerCase() === ALLOWED_EMAIL.toLowerCase();
}

const auth = isConfigured ? getAuth(initializeApp(firebaseConfig)) : null;

// Resolves once with the signed-in allowed user, or null. Other accounts are left signed in,
// since the tool pages on this domain share the same Firebase session.
export function currentAllowedUser() {
    if (!auth) return Promise.resolve(null);
    return new Promise(function (resolve) {
        const stop = onAuthStateChanged(auth, function (user) {
            stop();
            resolve(user && isAllowedEmail(user.email) ? user : null);
        });
    });
}

export async function signIn(email, password) {
    if (!auth) throw Object.assign(new Error("Firebase is not configured."), { code: "app/not-configured" });
    if (!isAllowedEmail(email)) throw Object.assign(new Error("This account is not authorized."), { code: "app/not-allowed" });
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (!isAllowedEmail(cred.user.email)) {
        await signOut(auth);
        throw Object.assign(new Error("This account is not authorized."), { code: "app/not-allowed" });
    }
    return cred.user;
}

export function logOut() {
    return auth ? signOut(auth) : Promise.resolve();
}
