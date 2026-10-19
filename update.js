// Keeps the staff tools pages on the newest version without clearing anything or refreshing.
// sw.js downloads the pages fresh on every open; this file reloads a page that is already
// open when sw.js finds a newer version, including when the phone comes back to the tab.
(function () {
    "use strict";

    if (!("serviceWorker" in navigator)) return;

    var root = new URL(".", document.currentScript.src);
    var hadController = !!navigator.serviceWorker.controller;
    var pending = false;

    // The sign-in page waits while something is typed, so nothing typed is lost.
    function safeToReload() {
        var fields = document.querySelectorAll("input");
        for (var i = 0; i < fields.length; i++) {
            if (fields[i].value) return false;
        }
        return true;
    }

    function update() {
        pending = true;
        if (safeToReload()) window.location.reload();
    }

    navigator.serviceWorker.register(new URL("sw.js", root).href).catch(function (err) {
        console.warn("Service worker registration failed:", err);
    });

    navigator.serviceWorker.addEventListener("message", function (e) {
        if (e.data && e.data.type === "ec-site-updated") update();
    });

    // A phone that first opened the page before sw.js was running gets a single reload
    // once sw.js takes over, so it isn't left on the old saved copy.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!hadController) {
            hadController = true;
            try {
                if (sessionStorage.getItem("ec-sw-reloaded")) return;
                sessionStorage.setItem("ec-sw-reloaded", "1");
            } catch (e) { return; }
            update();
        }
    });

    // Coming back to the tab: check the page's files again (sw.js reports any change).
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") {
            if (pending && safeToReload()) window.location.reload();
            return;
        }
        if (!navigator.serviceWorker.controller) return;
        ["", "auth.js", "firebase-config.js", "update.js"].forEach(function (file) {
            var url = new URL(file ? new URL(file, root).href : window.location.href.split("#")[0]);
            url.searchParams.set("ec-check", "1");
            fetch(url.href, { cache: "no-cache" }).catch(function () {});
        });
    });
})();
