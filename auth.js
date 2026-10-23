import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig, ALLOWED_EMAILS } from "./firebase-config.js";

export const isConfigured = !/REPLACE_WITH/.test(JSON.stringify(firebaseConfig));

export function isAllowedEmail(email) {
    if (typeof email !== "string") return false;
    const e = email.trim().toLowerCase();
    return ALLOWED_EMAILS.some(function (a) { return a.toLowerCase() === e; });
}

const auth = isConfigured ? getAuth(initializeApp(firebaseConfig)) : null;

// Resolves once with a signed-in allowed user, or null. Other accounts are left signed in,
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

// Failed and refused sign-ins are reported to the E&C security log (the Security section of the
// usage page). Firebase runs no server code when a password is wrong, so the page has to say so.
// The server adds the real IP address and checks the sign-in token sent with a refusal. Only the
// error code is sent, never the password. A report never blocks a sign-in, and is dropped if it
// can't be sent.
const SECURITY_REPORT_URL = "https://us-central1-eandccourier-36fcc.cloudfunctions.net/auditSignInReport";

function sendReport(report) {
    try {
        const body = JSON.stringify(Object.assign({ app: "portal", at: Date.now(), page: location.pathname }, report));
        // text/plain needs no CORS preflight, and a beacon is still sent when the page closes
        if (navigator.sendBeacon && navigator.sendBeacon(SECURITY_REPORT_URL, new Blob([body], { type: "text/plain" }))) return;
        fetch(SECURITY_REPORT_URL, { method: "POST", mode: "no-cors", keepalive: true, body }).catch(function () {});
    } catch (e) { /* never get in the way of signing in */ }
}

function reportFailed(email, code) {
    if (code === "auth/network-request-failed") return; // nothing reaches the server anyway
    sendReport({ kind: "failed", email: String(email || "").trim().toLowerCase().slice(0, 200), code: String(code || "unknown") });
}

async function reportRefused(user, reason) {
    let idToken = null;
    try { idToken = await user.getIdToken(); } catch (e) { /* sent without it; the server marks it unverified */ }
    sendReport({ kind: "refused", email: String(user.email || "").toLowerCase().slice(0, 200), reason, idToken });
}

// A sign-in that worked, so the security log can show which app it was (Firebase can't tell the server).
function reportSignedIn(user) {
    user.getIdToken().then(function (idToken) {
        sendReport({ kind: "signedin", email: String(user.email || "").toLowerCase().slice(0, 200), idToken });
    }).catch(function () {});
}

export async function signIn(email, password) {
    if (!auth) throw Object.assign(new Error("Firebase is not configured."), { code: "app/not-configured" });
    if (!isAllowedEmail(email)) {
        reportFailed(email, "app/not-allowed");
        throw Object.assign(new Error("This account is not authorized."), { code: "app/not-allowed" });
    }
    let cred;
    try {
        cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
        reportFailed(email, err && err.code);
        throw err;
    }
    if (!isAllowedEmail(cred.user.email)) {
        await reportRefused(cred.user, "Not on the allowed list");
        await signOut(auth);
        throw Object.assign(new Error("This account is not authorized."), { code: "app/not-allowed" });
    }
    reportSignedIn(cred.user);
    return cred.user;
}

export function logOut() {
    return auth ? signOut(auth) : Promise.resolve();
}
