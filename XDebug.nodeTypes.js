/**
 * Journey Debugger — Custom Node
 * Author: Harjinder Dhanjal <malotian@gmail.com>
 *
 * NODE CONFIGURATION (set these in the Node Designer UI):
 * ─────────────────────────────────────────────────────────
 * Name:        Journey Debugger  v10
 * Description: Displays nodeState, request headers, and cookies
 *              in an interactive overlay during journey execution.
 * Category:    Developer Tools
 * Tags:        debug, developer, nodestate
 *
 * PROPERTIES (define in Node Designer):
 * ─────────────────────────────────────────────────────────
 *   Name        : enabled
 *   Label       : Enable Debugger
 *   Type        : Boolean
 *   Required    : No
 *   Default     : true
 *   Description : When false the node passes through immediately.
 *
 *   Name        : title
 *   Label       : Debugger Title
 *   Type        : String
 *   Required    : No
 *   Default     : XDebug
 *   Description : Title shown in the debugger header bar.
 *
 * OUTCOMES: true
 * SETTINGS: Error Outcome enabled
 *
 * HOW IT WORKS
 * ─────────────────────────────────────────────────────────
 * 1. First pass  – renders the debugger overlay.
 * 2. User stages edits via ✏ drawer, then clicks "Submit & Continue →".
 * 3. Second pass – applies staged mutations and exits via "true" outcome.
 * ============================================================
 */

if (properties.enabled === false) {
    action.goTo("true");
} else if (!callbacks.isEmpty()) {
    var debugLogs = [];
    try {
        debugLogs.push("Server processing callbacks.");
        var toJava = function(val) {
            if (val === null || typeof val !== 'object') {
                return val;
            }
            if (typeof Java !== 'undefined' && typeof Java.asJSONCompatible === 'function') {
                return Java.asJSONCompatible(val);
            }
            return val;
        };

        var mutationsStr = null;
        var nameCallbacks = callbacks.getNameCallbacks();
        debugLogs.push("getNameCallbacks response: " + (nameCallbacks ? nameCallbacks.size() + " callbacks" : "null"));
        if (nameCallbacks && nameCallbacks.size() > 0) {
            mutationsStr = nameCallbacks.get(0);
        }

        if (mutationsStr) {
            debugLogs.push("mutationsCallback value: '" + mutationsStr + "'");
            if (mutationsStr.trim() !== "") {
                var mutations = JSON.parse(mutationsStr);
                debugLogs.push("Parsed " + mutations.length + " mutations");
                for (var j = 0; j < mutations.length; j++) {
                    var mut = mutations[j];
                    debugLogs.push("Processing " + mut.action + " for key: " + mut.key + " with value: " + JSON.stringify(mut.value));
                    if (mut.action === "put") {
                        if (mut.merge) {
                            var existing = nodeState.get(mut.key);
                            var base = {};
                            if (existing) {
                                try {
                                    if (typeof existing === 'string') {
                                        base = JSON.parse(existing);
                                    } else {
                                        base = JSON.parse(JSON.stringify(existing));
                                    }
                                } catch (e) { }
                            }
                            if (typeof base === 'object' && base !== null && typeof mut.value === 'object' && mut.value !== null) {
                                for (var k in mut.value) {
                                    base[k] = mut.value[k];
                                }
                                nodeState.putShared(mut.key, toJava(base));
                            } else {
                                nodeState.putShared(mut.key, toJava(mut.value));
                            }
                        } else if (mut.key.indexOf('.') !== -1) {
                            var parts = mut.key.split('.');
                            var rootKey = parts[0];
                            var currentObj = {};
                            try {
                                var existing = nodeState.get(rootKey);
                                if (existing) {
                                    if (typeof existing === 'string') {
                                        currentObj = JSON.parse(existing);
                                    } else {
                                        currentObj = JSON.parse(JSON.stringify(existing));
                                    }
                                }
                            } catch (e) { }
                            var temp = currentObj;
                            for (var p = 1; p < parts.length - 1; p++) {
                                if (!temp[parts[p]] || typeof temp[parts[p]] !== 'object') {
                                    temp[parts[p]] = {};
                                }
                                temp = temp[parts[p]];
                            }
                            temp[parts[parts.length - 1]] = mut.value;
                            nodeState.putShared(rootKey, toJava(currentObj));
                        } else {
                            nodeState.putShared(mut.key, toJava(mut.value));
                        }
                    } else if (mut.action === "remove") {
                        if (mut.key.indexOf('.') !== -1) {
                            var parts = mut.key.split('.');
                            var rootKey = parts[0];
                            try {
                                var existing = nodeState.get(rootKey);
                                if (existing) {
                                    var currentObj = {};
                                    if (typeof existing === 'string') {
                                        currentObj = JSON.parse(existing);
                                    } else {
                                        currentObj = JSON.parse(JSON.stringify(existing));
                                    }
                                    var temp = currentObj;
                                    for (var p = 1; p < parts.length - 1; p++) {
                                        if (temp[parts[p]]) {
                                            temp = temp[parts[p]];
                                        } else {
                                            temp = null;
                                            break;
                                        }
                                    }
                                    if (temp) {
                                        delete temp[parts[parts.length - 1]];
                                        nodeState.putShared(rootKey, toJava(currentObj));
                                    }
                                }
                            } catch (e) { }
                        } else {
                            nodeState.remove(mut.key);
                        }
                    }
                }
            }
        } else {
            debugLogs.push("mutationsCallback NOT found!");
        }
    } catch (err) {
        var errStr = err + (err.stack ? " at " + err.stack : "");
        debugLogs.push("Server Error: " + errStr);
        try {
            java.lang.System.out.println("XDebug Mutation Error: " + errStr);
        } catch (e) { }
    }
    try {
        java.lang.System.out.println("XDebug Tracing: " + JSON.stringify(debugLogs));
    } catch (e) { }
    action.goTo("true");
} else {

    // ------------------------------------------------------------------
    // 1. Collect nodeState
    // ------------------------------------------------------------------
    var stateObj = {};
    try {
        var keys = nodeState.keys();
        var iterator = keys.iterator();
        while (iterator.hasNext()) {
            var key = iterator.next();
            var value = nodeState.get(key);
            if (value !== null && typeof value === 'object') {
                try { stateObj[String(key)] = JSON.parse(JSON.stringify(value)); }
                catch (e) { stateObj[String(key)] = String(value); }
            } else {
                stateObj[String(key)] = value;
            }
        }
    } catch (err) {
        stateObj = { "_error": "Error extracting nodeState: " + err.message };
    }

    // ------------------------------------------------------------------
    // 2. Collect request headers
    // ------------------------------------------------------------------
    var requestHeadersObj = {};
    try {
        if (typeof requestHeaders !== 'undefined' && requestHeaders) {
            var headerKeys = Object.keys(requestHeaders);
            for (var i = 0; i < headerKeys.length; i++) {
                requestHeadersObj[headerKeys[i]] = requestHeaders[headerKeys[i]];
            }
        }
    } catch (e) { requestHeadersObj = { "_error": String(e) }; }

    // ------------------------------------------------------------------
    // 3. Collect request cookies
    // ------------------------------------------------------------------
    var requestCookiesObj = {};
    try {
        if (typeof requestCookies !== 'undefined' && requestCookies) {
            var cookieKeys = Object.keys(requestCookies);
            for (var i = 0; i < cookieKeys.length; i++) {
                requestCookiesObj[cookieKeys[i]] = requestCookies[cookieKeys[i]];
            }
        }
    } catch (e) { requestCookiesObj = { "_error": String(e) }; }

    // ------------------------------------------------------------------
    // 4. Resolve title
    // ------------------------------------------------------------------
    var debugTitle = (properties.title && String(properties.title).trim() !== '')
        ? String(properties.title) : 'XDebug';

    // ------------------------------------------------------------------
    // 5. Build hidden data containers
    // ------------------------------------------------------------------
    var htmlContent =
        '<div id="debug-wrapper"></div>' +
        '<div id="raw-nodestate" style="display:none;">' + JSON.stringify(stateObj) + '</div>' +
        '<div id="raw-headers"   style="display:none;">' + JSON.stringify(requestHeadersObj) + '</div>' +
        '<div id="raw-cookies"   style="display:none;">' + JSON.stringify(requestCookiesObj) + '</div>' +
        '<div id="raw-title"     style="display:none;">' + debugTitle + '</div>';

    callbacksBuilder.textOutputCallback(0, " ");
    callbacksBuilder.textOutputCallback(0, htmlContent);
    callbacksBuilder.nameCallback("nodeStateMutations");

    // ------------------------------------------------------------------
    // 6. Client-side debugger
    // ------------------------------------------------------------------
    var clientScript = `(function() {

    var debugWrapper = document.getElementById('debug-wrapper');
    if (!debugWrapper) return;

    var nodeStateData         = JSON.parse(document.getElementById('raw-nodestate').textContent || '{}');
    var nodeStateDataOriginal = JSON.parse(document.getElementById('raw-nodestate').textContent || '{}');
    var requestHeadersData = JSON.parse(document.getElementById('raw-headers').textContent   || '{}');
    var requestCookiesData = JSON.parse(document.getElementById('raw-cookies').textContent   || '{}');
    var titleText          = document.getElementById('raw-title').textContent || 'XDebugger';

    function countKeys(obj) { try { return Object.keys(obj).length; } catch(e) { return 0; } }

    var tabs = [
        { id: 'nodestate', label: 'Node State',      icon: 'NS', data: nodeStateData      },
        { id: 'headers',   label: 'Request Headers', icon: 'RH', data: requestHeadersData },
        { id: 'cookies',   label: 'Cookies',         icon: 'CK', data: requestCookiesData }
    ];

    /* ══════════════════════════════════════════════════════════
       SVG ICONS
    ══════════════════════════════════════════════════════════ */
    var SVG_EDIT     = '';
    var SVG_EDIT_FAB = '';
    var SVG_SAVE     = '&#10003; ';

    /* ══════════════════════════════════════════════════════════
       STYLES
    ══════════════════════════════════════════════════════════ */
    var css = \`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');

        /* ─────────────────────────────────────────────────────────────────
           VSCode Dark Modern — exact token values from dark_modern.json
           editor.background    #1F1F1F    foreground       #CCCCCC
           tabsBackground       #181818    focusBorder      #0078D4
           input.background     #313131    button.bg        #0078D4
           string               #CE9178    number           #B5CEA8
           variable/key         #9CDCFE    keyword/bool     #569CD6
        ───────────────────────────────────────────────────────────────── */

        .dbg-overlay {
            position: fixed !important; inset: 0 !important;
            background: rgba(0,0,0,0.7) !important;
            backdrop-filter: blur(3px) !important; -webkit-backdrop-filter: blur(3px) !important;
            z-index: 999998 !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            animation: dbgFadeIn 0.16s ease;
        }
        @keyframes dbgFadeIn { from { opacity:0; } to { opacity:1; } }

        .dbg-panel {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1F1F1F; border: 1px solid #2B2B2B; border-radius: 6px; position: relative;
            width: 72vw; max-width: 1080px; height: 78vh; max-height: 900px; min-height: 480px;
            display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
            box-shadow: 0 0 0 1px #111, 0 24px 64px -12px rgba(0,0,0,0.8), 0 8px 24px -4px rgba(0,0,0,0.5);
            animation: dbgSlideUp 0.2s cubic-bezier(0.34,1.3,0.64,1);
        }
        @keyframes dbgSlideUp {
            from { opacity:0; transform: translateY(14px) scale(0.98); }
            to   { opacity:1; transform: translateY(0) scale(1); }
        }
        .dbg-panel.dbg-maximized {
            position: fixed !important; inset: 10px !important;
            width: calc(100vw - 20px) !important; height: calc(100vh - 20px) !important;
            max-width: none !important; max-height: none !important;
            border-radius: 4px !important; z-index: 1000000 !important;
        }

        /* ── title bar (titleBar.activeBackground) ── */
        .dbg-titlebar {
            display: flex; align-items: center; gap: 10px;
            padding: 0 12px 0 16px; height: 35px; min-height: 35px;
            background: #181818; border-bottom: 1px solid #2B2B2B; flex-shrink: 0;
        }
        .dbg-title-text {
            font-size: 12px; font-weight: 400; color: #CCCCCC; letter-spacing: 0.02em;
            flex: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .dbg-title-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
        .dbg-title-sep { width: 1px; height: 16px; background: #2B2B2B; margin: 0 2px; }

        .dbg-icon-btn {
            background: transparent !important; border: none !important; cursor: pointer;
            color: #6E7681 !important; width: 28px; height: 28px; border-radius: 4px !important;
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 14px; transition: color 0.12s, background 0.12s !important;
            box-shadow: none !important; padding: 0 !important; line-height: 1; flex-shrink: 0;
        }
        .dbg-icon-btn:hover { color: #CCCCCC !important; background: #3C3C3C !important; }
        .dbg-icon-btn.dbg-dismiss-btn:hover { color: #F85149 !important; background: #3C1515 !important; }

        /* Continue / Save & Continue (button.background = #0078D4) */
        .dbg-continue-btn {
            display: inline-flex; align-items: center; gap: 6px;
            background: #0078D4 !important; color: #FFFFFF !important;
            border: none !important; border-radius: 3px !important;
            padding: 4px 12px !important; font-size: 12px; font-weight: 400;
            cursor: pointer; font-family: inherit; letter-spacing: 0.01em;
            transition: background 0.12s !important;
            white-space: nowrap; flex-shrink: 0;
        }
        .dbg-continue-btn:hover { background: #006BBD !important; }
        .dbg-continue-btn:active { background: #005A9E !important; }
        .dbg-continue-btn:disabled { background: #313131 !important; color: #6E7681 !important; cursor: not-allowed !important; }
        .dbg-continue-btn.dbg-dirty {
            background: #D97706 !important;
            animation: dbgPulseRing 2.2s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        .dbg-continue-btn.dbg-dirty:hover { background: #B45309 !important; animation: none !important; }
        @keyframes dbgPulseRing {
            0%   { box-shadow: 0 0 0 0 rgba(217,119,6,0.6) !important; }
            60%  { box-shadow: 0 0 0 5px rgba(217,119,6,0) !important; }
            100% { box-shadow: 0 0 0 0 rgba(217,119,6,0) !important; }
        }

        /* dismiss banner */
        .dbg-dismiss-banner {
            display: none; align-items: center; gap: 10px;
            padding: 7px 16px; background: #2D2000; border-bottom: 1px solid #6B5000;
            font-size: 12px; color: #E2B714; flex-shrink: 0;
            animation: dbgSlideDown 0.16s ease;
        }
        .dbg-dismiss-banner.dbg-banner-visible { display: flex; }
        @keyframes dbgSlideDown { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .dbg-dismiss-banner-msg { flex: 1; }
        .dbg-dismiss-banner-msg strong { font-weight: 600; color: #FFC107; }
        .dbg-banner-btn {
            background: none !important; border: 1px solid currentColor !important;
            border-radius: 3px !important; padding: 3px 10px !important;
            font-size: 11.5px; font-weight: 500; cursor: pointer; font-family: inherit;
            transition: background 0.12s !important; box-shadow: none !important; line-height: 1.4;
        }
        .dbg-banner-btn-discard { color: #F85149 !important; border-color: #6B2020 !important; }
        .dbg-banner-btn-discard:hover { background: #3C1515 !important; }
        .dbg-banner-btn-save { color: #2EA043 !important; border-color: #1A5C28 !important; }
        .dbg-banner-btn-save:hover { background: #0D3015 !important; }
        .dbg-banner-btn-cancel { color: #6E7681 !important; border-color: #2B2B2B !important; }
        .dbg-banner-btn-cancel:hover { background: #2D2D2D !important; }

        /* ── tab bar — editorGroupHeader.tabsBackground = #181818, active tab = editor.background ── */
        .dbg-tabbar {
            display: flex; align-items: stretch; padding: 0; gap: 0;
            background: #181818; border-bottom: 1px solid #2B2B2B;
            flex-shrink: 0; height: 35px; min-height: 35px;
        }
        .dbg-tab {
            display: flex; align-items: center; gap: 7px;
            padding: 0 16px !important; border-radius: 0 !important;
            border: none !important;
            border-top: 1px solid transparent !important;
            border-bottom: 1px solid #2B2B2B !important;
            background: #2D2D2D !important;
            color: #6E7681 !important; font-size: 12px; font-weight: 400;
            cursor: pointer; transition: color 0.12s, background 0.12s !important;
            white-space: nowrap; box-shadow: none !important; font-family: inherit;
            margin-bottom: -1px;
        }
        .dbg-tab:hover { color: #CCCCCC !important; background: #303030 !important; }
        .dbg-tab.dbg-tab-active {
            color: #CCCCCC !important;
            background: #1F1F1F !important;
            border-top-color: #0078D4 !important;
            border-bottom-color: #1F1F1F !important;
        }
        .dbg-tab-pill {
            font-size: 9px; font-weight: 700; background: #2D2D2D; color: #6E7681;
            padding: 1px 4px; border-radius: 2px; letter-spacing: 0.04em;
            transition: background 0.12s, color 0.12s;
        }
        .dbg-tab.dbg-tab-active .dbg-tab-pill { background: #0078D4; color: #FFFFFF; }
        .dbg-tab-count {
            font-size: 10px; font-weight: 500; background: #2D2D2D; color: #6E7681;
            padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center;
            transition: background 0.12s, color 0.12s;
        }
        .dbg-tab.dbg-tab-active .dbg-tab-count { background: #0078D4; color: #FFFFFF; }
        .dbg-tabbar-spacer { flex: 1; background: #181818; border-bottom: 1px solid #2B2B2B; margin-bottom: -1px; }

        /* tab warning strip */
        .dbg-tab-warning {
            display: none; align-items: center; gap: 8px;
            padding: 5px 16px; background: #2D2000; border-bottom: 1px solid #6B5000;
            font-size: 11.5px; color: #E2B714; flex-shrink: 0;
        }
        .dbg-tab-warning.dbg-visible { display: flex; }
        .dbg-tab-warning-dot { width: 6px; height: 6px; border-radius: 50%; background: #D97706; flex-shrink: 0; }

        /* ── toolbar ── */
        .dbg-toolbar {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 12px; background: #1F1F1F; border-bottom: 1px solid #2B2B2B; flex-shrink: 0;
        }
        .dbg-search-wrap { flex: 1; position: relative; display: flex; align-items: center; }
        .dbg-search-icon { position: absolute; left: 10px; color: #6E7681; font-size: 13px; pointer-events: none; }
        .dbg-search {
            width: 100%; background: #313131 !important; border: 1px solid #3C3C3C !important;
            color: #CCCCCC !important; padding: 5px 50px 5px 30px !important;
            border-radius: 3px !important; font-size: 12px; outline: none !important;
            box-sizing: border-box; font-family: 'JetBrains Mono', monospace;
            transition: border-color 0.12s !important; box-shadow: none !important;
        }
        .dbg-search::placeholder { color: #989898; }
        .dbg-search:focus { border-color: #0078D4 !important; }
        .dbg-search-right { position: absolute; right: 6px; display: flex; align-items: center; gap: 4px; }
        .dbg-regex-btn {
            background: none !important; border: 1px solid transparent !important;
            color: #6E7681 !important; cursor: pointer; font-size: 11px;
            padding: 2px 5px !important; border-radius: 3px !important;
            line-height: 1; box-shadow: none !important; font-family: 'JetBrains Mono', monospace;
            font-weight: 700; transition: all 0.12s !important;
        }
        .dbg-regex-btn:hover { color: #CCCCCC !important; border-color: #6E7681 !important; }
        .dbg-regex-btn.dbg-regex-active { color: #CCCCCC !important; border-color: #0078D4 !important; background: #0E3A5C !important; }
        .dbg-search-clear {
            background: none !important; border: none !important; color: #6E7681 !important;
            cursor: pointer; font-size: 13px; padding: 2px !important; display: none; line-height: 1;
            box-shadow: none !important; border-radius: 3px !important;
        }
        .dbg-search-clear:hover { color: #CCCCCC !important; }
        .dbg-toolbar-btn {
            background: #313131 !important; border: 1px solid #3C3C3C !important;
            color: #6E7681 !important; padding: 4px 10px !important; border-radius: 3px !important;
            font-size: 11px; cursor: pointer; white-space: nowrap;
            transition: all 0.12s !important; box-shadow: none !important; font-family: inherit;
        }
        .dbg-toolbar-btn:hover { background: #3C3C3C !important; color: #CCCCCC !important; border-color: #6E7681 !important; }
        .dbg-result-count { font-size: 11px; color: #6E7681; white-space: nowrap; min-width: 60px; text-align: right; }

        /* ── view container ── */
        #dbg-view-container {
            flex: 1; display: flex; flex-direction: row; min-height: 0; position: relative; overflow: hidden;
        }

        /* ── json tree viewer ── */
        .dbg-json-viewer {
            flex: 1; font-family: 'JetBrains Mono', Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px; background: #1F1F1F; padding: 12px 16px;
            overflow: auto; line-height: 1.7; box-sizing: border-box;
            color: #CCCCCC; text-align: left !important;
        }
        .dbg-empty {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%; color: #3C3C3C; font-size: 13px; gap: 8px;
        }
        .dbg-empty-icon { font-size: 36px; opacity: 0.3; }

        /* ── JSON nodes ── */
        .dbg-node { padding-left: 16px; position: relative; text-align: left !important; }
        .dbg-node.dbg-node-staged {
            border-left: 2px solid #D97706;
            margin-left: -2px;
            background: linear-gradient(90deg, rgba(217,119,6,0.07) 0%, transparent 40%);
        }
        .dbg-node-key { color: #9CDCFE; font-weight: 400; cursor: default; }
        .dbg-node-editbtn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 18px; height: 18px; border-radius: 3px;
            margin-left: 4px; opacity: 0; cursor: pointer;
            color: #6E7681; vertical-align: middle;
            transition: opacity 0.12s, color 0.12s, background 0.12s;
        }
        .dbg-node:hover > .dbg-node-editbtn { opacity: 1; }
        .dbg-node-editbtn:hover { color: #9CDCFE !important; background: #1A3A5C; }
        .dbg-node-delbtn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 16px; height: 16px; border-radius: 3px;
            margin-left: 3px; opacity: 0; cursor: pointer;
            color: #3C3C3C; font-size: 10px; vertical-align: middle;
            transition: opacity 0.12s, color 0.12s, background 0.12s;
            user-select: none;
        }
        .dbg-node:hover > .dbg-node-delbtn { opacity: 1; }
        .dbg-node-delbtn:hover { color: #F85149 !important; background: #3C1515; }
        .dbg-node-colon { color: #808080; margin-right: 4px; }
        .dbg-val-string  { color: #CE9178; }
        .dbg-val-number  { color: #B5CEA8; }
        .dbg-val-boolean { color: #569CD6; }
        .dbg-val-null    { color: #808080; font-style: italic; }
        .dbg-brace       { color: #808080; }
        .dbg-val-string, .dbg-val-number, .dbg-val-boolean, .dbg-val-null {
            cursor: pointer; border-radius: 2px; transition: background 0.1s;
        }
        .dbg-val-string:hover  { background: rgba(206,145,120,0.1); }
        .dbg-val-number:hover  { background: rgba(181,206,168,0.1); }
        .dbg-val-boolean:hover { background: rgba(86,156,214,0.1); }
        .dbg-val-null:hover    { background: rgba(128,128,128,0.1); }

        /* value parse preview */
        .dbg-val-preview {
            font-size: 11px; color: #6E7681; font-family: 'JetBrains Mono', monospace;
            padding: 3px 8px; background: #181818; border-radius: 3px;
            border-left: 2px solid #0078D4; display: none; word-break: break-all;
        }
        .dbg-val-preview.dbg-preview-err { border-color: #F85149; color: #F85149; }
        .dbg-val-preview.dbg-preview-show { display: block; }

        .dbg-toggle {
            position: absolute; left: 1px; top: 4px; width: 13px; height: 13px;
            cursor: pointer; color: #6E7681; display: inline-flex;
            align-items: center; justify-content: center; font-size: 7px;
            user-select: none; transition: color 0.1s, transform 0.14s; border-radius: 2px;
        }
        .dbg-toggle:hover { color: #CCCCCC; }
        .dbg-toggle::before { content: '▾'; display: block; }
        .dbg-collapsed > .dbg-toggle { transform: rotate(-90deg); }
        .dbg-collapsed > .dbg-children { display: none; }
        .dbg-collapsed > .dbg-ellipsis { display: inline; }
        .dbg-ellipsis { display: none; color: #6E7681; cursor: pointer; font-size: 11px; }
        .dbg-ellipsis:hover { color: #CCCCCC; }
        .dbg-hidden { display: none !important; }
        .dbg-highlight { background: #9E6A03; color: #CCCCCC; border-radius: 2px; padding: 0 1px; }

        /* ── edit drawer ── */
        .dbg-edit-drawer {
            position: absolute; top: 0; right: 0; bottom: 0; width: 300px;
            background: #181818; border-left: 1px solid #2B2B2B;
            display: flex; flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.24s cubic-bezier(0.4,0,0.2,1), box-shadow 0.24s;
            z-index: 10; overflow: hidden;
        }
        .dbg-edit-drawer.dbg-drawer-open {
            transform: translateX(0);
            box-shadow: -8px 0 32px rgba(0,0,0,0.5);
        }
        .dbg-drawer-header {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px 8px; border-bottom: 1px solid #2B2B2B;
            background: #181818; flex-shrink: 0;
        }
        .dbg-drawer-header-icon {
            width: 24px; height: 24px; border-radius: 4px;
            background: #0E3A5C; color: #9CDCFE;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .dbg-drawer-title { font-size: 12px; font-weight: 400; color: #CCCCCC; flex: 1; }
        .dbg-drawer-staged-pill {
            font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 10px;
            background: #3D2B00; color: #D97706; display: none;
        }
        .dbg-drawer-staged-pill.dbg-visible { display: inline-block; }
        .dbg-drawer-close {
            background: none !important; border: none !important; cursor: pointer;
            color: #6E7681 !important; width: 22px; height: 22px; border-radius: 3px !important;
            display: flex; align-items: center; justify-content: center; font-size: 14px;
            transition: color 0.12s, background 0.12s !important; box-shadow: none !important; padding: 0 !important;
        }
        .dbg-drawer-close:hover { color: #CCCCCC !important; background: #3C3C3C !important; }

        /* drawer body */
        .dbg-drawer-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .dbg-drawer-body::-webkit-scrollbar { width: 6px; }
        .dbg-drawer-body::-webkit-scrollbar-track { background: #181818; }
        .dbg-drawer-body::-webkit-scrollbar-thumb { background: #424242; border-radius: 0; }
        .dbg-json-viewer::-webkit-scrollbar { width: 8px; height: 8px; }
        .dbg-json-viewer::-webkit-scrollbar-track { background: #1F1F1F; }
        .dbg-json-viewer::-webkit-scrollbar-thumb { background: #424242; }
        .dbg-json-viewer::-webkit-scrollbar-thumb:hover { background: #555; }

        /* field groups */
        .dbg-field-group { display: flex; flex-direction: column; gap: 4px; }
        .dbg-field-label {
            font-size: 10px; font-weight: 600; color: #6E7681;
            text-transform: uppercase; letter-spacing: 0.08em;
        }
        .dbg-mut-input {
            background: #313131 !important; color: #CCCCCC !important;
            padding: 6px 9px; border: 1px solid #3C3C3C; border-radius: 3px;
            font-size: 12px; font-family: 'JetBrains Mono', monospace;
            outline: none; box-sizing: border-box; width: 100%;
            transition: border-color 0.12s;
        }
        .dbg-mut-input:focus { border-color: #0078D4 !important; }
        .dbg-mut-input.dbg-input-warn { border-color: #D97706 !important; background: #2A1F00 !important; }
        select.dbg-mut-input { cursor: pointer; }
        select.dbg-mut-input option { background: #313131; color: #CCCCCC; }
        textarea.dbg-mut-input { min-height: 68px; resize: vertical; line-height: 1.5; }
        .dbg-key-hint { font-size: 10px; color: #6E7681; }
        .dbg-dup-warn { font-size: 10.5px; color: #E2B714; display: none; }
        .dbg-dup-warn.dbg-visible { display: block; }

        /* merge toggle */
        .dbg-merge-toggle {
            display: flex; align-items: center; gap: 8px; padding: 7px 9px;
            background: #181818; border: 1px solid #2B2B2B; border-radius: 3px;
            cursor: pointer; user-select: none;
        }
        .dbg-merge-toggle input[type=checkbox] { margin: 0; accent-color: #0078D4; cursor: pointer; }
        .dbg-merge-toggle-label { font-size: 11.5px; color: #CCCCCC; flex: 1; }
        .dbg-merge-hint { font-size: 10px; color: #6E7681; }

        /* stage button */
        .dbg-apply-btn {
            background: #0078D4 !important; color: #FFFFFF !important;
            border: none !important; padding: 7px 12px !important; border-radius: 3px !important;
            font-size: 12px; font-weight: 400; cursor: pointer;
            transition: background 0.12s !important; box-shadow: none !important;
            width: 100%; font-family: inherit;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .dbg-apply-btn:hover { background: #006BBD !important; }
        .dbg-apply-btn:active { background: #005A9E !important; }
        .dbg-apply-btn:disabled { background: #181818 !important; color: #6E7681 !important; cursor: not-allowed !important; }

        /* staged section */
        .dbg-staged-section { border-top: 1px solid #2B2B2B; padding-top: 10px; display: none; }
        .dbg-staged-section.dbg-visible { display: block; }
        .dbg-staged-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
        .dbg-staged-title {
            font-size: 10px; font-weight: 600; color: #6E7681;
            text-transform: uppercase; letter-spacing: 0.08em;
            display: flex; align-items: center; gap: 6px;
        }
        .dbg-staged-badge {
            background: #3D2B00; color: #D97706; border-radius: 10px;
            padding: 1px 7px; font-size: 10px; font-weight: 700;
        }
        .dbg-clear-all {
            font-size: 10.5px; color: #6E7681; cursor: pointer;
            background: none !important; border: none !important; padding: 0 !important;
            box-shadow: none !important; font-family: inherit;
        }
        .dbg-clear-all:hover { color: #F85149 !important; }
        .dbg-staged-list { display: flex; flex-direction: column; gap: 3px; }
        .dbg-staged-item {
            display: flex; align-items: center; gap: 6px;
            padding: 4px 8px; background: #1F1F1F; border: 1px solid #2B2B2B;
            border-radius: 3px; font-size: 11px; font-family: 'JetBrains Mono', monospace;
        }
        .dbg-staged-item.dbg-action-put    { border-left: 3px solid #2EA043; }
        .dbg-staged-item.dbg-action-remove { border-left: 3px solid #F85149; }
        .dbg-staged-action { font-weight: 700; font-size: 9px; text-transform: uppercase; width: 36px; flex-shrink: 0; }
        .dbg-action-put    .dbg-staged-action { color: #2EA043; }
        .dbg-action-remove .dbg-staged-action { color: #F85149; }
        .dbg-staged-key { color: #9CDCFE; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dbg-staged-remove {
            background: none !important; border: none !important; cursor: pointer;
            color: #3C3C3C !important; font-size: 12px; padding: 0 2px !important;
            line-height: 1; border-radius: 3px !important; box-shadow: none !important; flex-shrink: 0;
            transition: color 0.12s !important;
        }
        .dbg-staged-remove:hover { color: #F85149 !important; }

        /* drawer status strip */
        .dbg-drawer-status {
            padding: 8px 12px; border-top: 1px solid #2B2B2B;
            background: #181818; flex-shrink: 0; font-size: 10.5px; line-height: 1.5;
        }
        .dbg-drawer-status.dbg-status-clean { color: #6E7681; }
        .dbg-drawer-status.dbg-status-dirty { color: #E2B714; background: #2D2000; border-top-color: #6B5000; }
        .dbg-drawer-status strong { font-weight: 600; }

        /* ── FAB ── */
        .dbg-fab {
            position: absolute !important; right: 16px; bottom: 16px;
            width: 36px; height: 36px;
            background: #0078D4 !important; color: #FFFFFF !important;
            border: none !important; border-radius: 4px !important;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important;
            transition: background 0.12s, transform 0.12s !important;
            z-index: 20;
        }
        .dbg-fab:hover { background: #006BBD !important; transform: translateY(-1px) !important; }
        .dbg-fab:active { transform: scale(0.94) !important; }
        .dbg-fab.dbg-dirty {
            background: #D97706 !important;
            animation: dbgFabPulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        @keyframes dbgFabPulse {
            0%   { box-shadow: 0 0 0 0 rgba(217,119,6,0.7), 0 2px 8px rgba(0,0,0,0.4) !important; }
            60%  { box-shadow: 0 0 0 7px rgba(217,119,6,0), 0 2px 8px rgba(0,0,0,0.4) !important; }
            100% { box-shadow: 0 0 0 0 rgba(217,119,6,0), 0 2px 8px rgba(0,0,0,0.4) !important; }
        }
        .dbg-fab-badge {
            position: absolute; top: -5px; right: -5px;
            background: #D97706; color: #FFFFFF; font-size: 9px; font-weight: 800;
            width: 16px; height: 16px; border-radius: 50%;
            display: none; align-items: center; justify-content: center;
            border: 2px solid #1F1F1F; font-family: 'Inter', sans-serif; pointer-events: none;
        }
        .dbg-fab-badge.dbg-visible { display: flex; }

        /* ── pencil icon via CSS mask ── */
        .dbg-pencil-icon {
            display: inline-block; width: 13px; height: 13px;
            background-color: currentColor;
            -webkit-mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgNEg0YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmgxNGEyIDIgMCAwIDAgMi0ydi03Ii8+PHBhdGggZD0iTTE4LjUgMi41YTIuMTIxIDIuMTIxIDAgMCAxIDMgM0wxMiAxNWwtNCAxIDEtNCA5LjUtOS41eiIvPjwvc3ZnPg==");
            mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTEgNEg0YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmgxNGEyIDIgMCAwIDAgMi0ydi03Ii8+PHBhdGggZD0iTTE4LjUgMi41YTIuMTIxIDIuMTIxIDAgMCAxIDMgM0wxMiAxNWwtNCAxIDEtNCA5LjUtOS41eiIvPjwvc3ZnPg==");
            -webkit-mask-size: contain; mask-size: contain;
            -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
            -webkit-mask-position: center; mask-position: center;
            vertical-align: middle; flex-shrink: 0;
        }
        .dbg-pencil-icon-lg { width: 15px; height: 15px; }

        /* ── status bar (statusBar.background = #0078D4) ── */
        .dbg-statusbar {
            display: flex; align-items: center; gap: 12px; padding: 4px 16px;
            background: #0078D4; border-top: none; flex-shrink: 0;
        }
        .dbg-status-item { font-size: 11px; color: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 4px; }
        .dbg-status-item strong { color: #FFFFFF; font-weight: 500; }
        .dbg-status-sep { color: rgba(255,255,255,0.3); }
        .dbg-status-spacer { flex: 1; }
        .dbg-kbd {
            display: inline-block; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
            border-radius: 3px; padding: 1px 5px; font-size: 10px; color: #FFFFFF; font-family: inherit;
        }

        /* ── toast ── */
        .dbg-toast {
            position: absolute !important; bottom: 40px !important; left: 50% !important;
            transform: translateX(-50%) translateY(6px) !important;
            background: #202020 !important; border: 1px solid #2B2B2B !important;
            color: #CCCCCC !important; padding: 7px 16px !important; border-radius: 4px !important;
            font-size: 12px !important; z-index: 1000002 !important;
            pointer-events: none !important; opacity: 0; white-space: nowrap;
            transition: opacity 0.16s, transform 0.16s !important; font-family: 'Inter', sans-serif;
            box-shadow: 0 4px 16px rgba(0,0,0,0.6) !important;
        }
        .dbg-toast.dbg-toast-show { opacity: 1 !important; transform: translateX(-50%) translateY(0) !important; }
        .dbg-toast-icon { margin-right: 6px; }
        .dbg-toast.dbg-toast-err { background: #3C1515 !important; border-color: #6B2020 !important; color: #F85149 !important; }
    \`;

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ══════════════════════════════════════════════════════════
       SHELL HTML
    ══════════════════════════════════════════════════════════ */
    var tabsHtml = tabs.map(function(t) {
        return '<button type="button" class="dbg-tab" id="tab-' + t.id + '">' +
               '<span class="dbg-tab-pill">' + t.icon + '</span>' +
               t.label +
               '<span class="dbg-tab-count">' + countKeys(t.data) + '</span>' +
               '</button>';
    }).join('');

    debugWrapper.innerHTML =
        '<div class="dbg-overlay" id="dbg-overlay">' +
          '<div class="dbg-panel" id="dbg-panel">' +

            /* title bar */
            '<div class="dbg-titlebar">' +
              '<div class="dbg-title-text">' + titleText + '</div>' +
              '<div class="dbg-title-actions">' +
                '<button type="button" class="dbg-icon-btn" id="dbg-btn-download" title="Download JSON (D)">⤓</button>' +
                '<button type="button" class="dbg-icon-btn" id="dbg-btn-copy"     title="Copy JSON (C)">⎘</button>' +
                '<button type="button" class="dbg-icon-btn" id="dbg-btn-maximize" title="Maximize (M)">⤢</button>' +
                '<div class="dbg-title-sep"></div>' +
                '<button type="button" class="dbg-continue-btn" id="dbg-btn-continue">Continue →</button>' +
                '<button type="button" class="dbg-icon-btn dbg-dismiss-btn" id="dbg-btn-dismiss" title="Dismiss without applying changes (Esc)">✕</button>' +
              '</div>' +
            '</div>' +

            /* dismiss banner (shown when dirty + user tries to close) */
            '<div class="dbg-dismiss-banner" id="dbg-dismiss-banner">' +
              '<div class="dbg-dismiss-banner-msg"><strong id="dbg-banner-count">N</strong> staged change(s) will be discarded. What would you like to do?</div>' +
              '<button type="button" class="dbg-banner-btn dbg-banner-btn-save"    id="dbg-banner-save">Save &amp; Continue</button>' +
              '<button type="button" class="dbg-banner-btn dbg-banner-btn-discard" id="dbg-banner-discard">Discard</button>' +
              '<button type="button" class="dbg-banner-btn dbg-banner-btn-cancel"  id="dbg-banner-cancel">Cancel</button>' +
            '</div>' +

            /* tab bar */
            '<div class="dbg-tabbar">' + tabsHtml + '<div class="dbg-tabbar-spacer"></div></div>' +

            /* tab warning (dirty + switching away from nodestate) */
            '<div class="dbg-tab-warning" id="dbg-tab-warning">' +
              '<span class="dbg-tab-warning-dot"></span>' +
              '<span id="dbg-tab-warning-msg">You have staged changes on Node State that won&#39;t be visible on this tab.</span>' +
            '</div>' +

            /* toolbar */
            '<div class="dbg-toolbar">' +
              '<div class="dbg-search-wrap">' +
                '<span class="dbg-search-icon">⌕</span>' +
                '<input type="text" class="dbg-search" id="dbg-search" placeholder="Search keys and values…" autocomplete="off">' +
                '<div class="dbg-search-right">' +
                  '<button type="button" class="dbg-regex-btn" id="dbg-regex-btn" title="Toggle regex">.*</button>' +
                  '<button type="button" class="dbg-search-clear" id="dbg-search-clear">✕</button>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="dbg-toolbar-btn" id="dbg-btn-expand-all">Expand all</button>' +
              '<button type="button" class="dbg-toolbar-btn" id="dbg-btn-collapse-all">Collapse all</button>' +
              '<div class="dbg-result-count" id="dbg-result-count"></div>' +
            '</div>' +

            /* main content area */
            '<div id="dbg-view-container">' +
              '<div class="dbg-json-viewer" id="dbg-viewer"></div>' +

              /* edit drawer */
              '<div class="dbg-edit-drawer" id="dbg-edit-drawer">' +
                '<div class="dbg-drawer-header">' +
                  '<div class="dbg-drawer-header-icon"><span class="dbg-pencil-icon dbg-pencil-icon-lg"></span></div>' +
                  '<span class="dbg-drawer-title" id="dbg-drawer-title">Edit Node State</span>' +
                  '<span class="dbg-drawer-staged-pill" id="dbg-drawer-pill"></span>' +
                  '<button type="button" class="dbg-drawer-close" id="dbg-drawer-close" title="Close editor">✕</button>' +
                '</div>' +
                '<div class="dbg-drawer-body" id="dbg-drawer-body">' +
                  /* key */
                  '<div class="dbg-field-group">' +
                    '<div class="dbg-field-label">Key</div>' +
                    '<input type="text" id="dbg-mut-key" class="dbg-mut-input" placeholder="e.g. username or profile.email" list="dbg-key-list" autocomplete="off">' +
                    '<datalist id="dbg-key-list"></datalist>' +
                    '<div class="dbg-key-hint">Use dot notation for nested paths</div>' +
                    '<div class="dbg-dup-warn" id="dbg-dup-warn">⚠ A staged change for this key already exists — staging again will replace it.</div>' +
                  '</div>' +
                  /* type */
                  '<div class="dbg-field-group">' +
                    '<div class="dbg-field-label">Value Type</div>' +
                    '<select id="dbg-mut-type" class="dbg-mut-input">' +
                      '<option value="string">String</option>' +
                      '<option value="number">Number</option>' +
                      '<option value="boolean">Boolean</option>' +
                      '<option value="json">JSON Object / Array</option>' +
                    '</select>' +
                  '</div>' +
                  /* value */
                  '<div class="dbg-field-group">' +
                    '<div class="dbg-field-label">Value</div>' +
                    '<textarea id="dbg-mut-val" class="dbg-mut-input" placeholder="Value…"></textarea>' +
                    '<div class="dbg-val-preview" id="dbg-val-preview"></div>' +
                  '</div>' +
                  /* merge */
                  '<label class="dbg-merge-toggle" for="dbg-mut-merge">' +
                    '<input type="checkbox" id="dbg-mut-merge">' +
                    '<span class="dbg-merge-toggle-label">Merge Shared</span>' +
                    '<span class="dbg-merge-hint">Deep-merge into existing object</span>' +
                  '</label>' +
                  /* stage button */
                  '<button type="button" id="dbg-mut-submit" class="dbg-apply-btn">Stage Change <kbd style="background:rgba(255,255,255,0.2);border:none;border-radius:3px;padding:1px 6px;font-size:10px;font-family:inherit;">↵</kbd></button>' +
                  /* staged list */
                  '<div class="dbg-staged-section" id="dbg-staged-section">' +
                    '<div class="dbg-staged-header">' +
                      '<div class="dbg-staged-title">Staged <span class="dbg-staged-badge" id="dbg-staged-badge">0</span></div>' +
                      '<button type="button" class="dbg-clear-all" id="dbg-clear-all">Clear all</button>' +
                    '</div>' +
                    '<div class="dbg-staged-list" id="dbg-staged-list"></div>' +
                  '</div>' +
                '</div>' +
                /* status strip — informational only */
                '<div class="dbg-drawer-status dbg-status-clean" id="dbg-drawer-status">No staged changes — journey will continue as-is.</div>' +
              '</div>' +

              /* FAB */
              '<button type="button" class="dbg-fab" id="dbg-fab" title="Edit Node State (E)" style="display:none;">' +
                '<span class="dbg-pencil-icon dbg-pencil-icon-lg" style="color:#fff;"></span>' +
                '<span class="dbg-fab-badge" id="dbg-fab-badge">0</span>' +
              '</button>' +
            '</div>' +

            /* status bar */
            '<div class="dbg-statusbar">' +
              '<div class="dbg-status-item">Keys: <strong id="dbg-stat-keys">0</strong></div>' +
              '<span class="dbg-status-sep">·</span>' +
              '<div class="dbg-status-item">Depth: <strong id="dbg-stat-depth">0</strong></div>' +
              '<div class="dbg-status-spacer"></div>' +
              '<div class="dbg-status-item">' +
                '<kbd class="dbg-kbd">Esc</kbd> dismiss &nbsp;' +
                '<kbd class="dbg-kbd">E</kbd> edit &nbsp;' +
                '<kbd class="dbg-kbd">C</kbd> copy &nbsp;' +
                '<kbd class="dbg-kbd">D</kbd> download &nbsp;' +
                '<kbd class="dbg-kbd">M</kbd> maximize' +
              '</div>' +
            '</div>' +

          '<div class="dbg-toast" id="dbg-toast"></div>' +
          '</div>' +
        '</div>';

    /* ══════════════════════════════════════════════════════════
       STATE & REFS
    ══════════════════════════════════════════════════════════ */
    var activeTab        = 'nodestate';
    var isMaximized      = false;
    var useRegex         = false;
    var drawerOpen       = false;
    var bannerVisible    = false;
    var searchEl         = document.getElementById('dbg-search');
    var clearBtn         = document.getElementById('dbg-search-clear');
    var regexBtn         = document.getElementById('dbg-regex-btn');
    var viewer           = document.getElementById('dbg-viewer');
    var panel            = document.getElementById('dbg-panel');
    var toast            = document.getElementById('dbg-toast');
    var drawer           = document.getElementById('dbg-edit-drawer');
    var fab              = document.getElementById('dbg-fab');
    var fabBadge         = document.getElementById('dbg-fab-badge');
    var toastTimer       = null;
    var mutationsInput   = null;
    var pendingMutations = [];
    /* track which root keys have staged changes for amber border */
    var stagedKeys       = {};

    /* ══════════════════════════════════════════════════════════
       VUE MODEL HELPER
    ══════════════════════════════════════════════════════════ */
    function updateVueModel(el, val) {
        var curr = el, limit = 5;
        while (curr && limit > 0) {
            if (curr.__vue__) {
                try {
                    if (curr.__vue__.value !== undefined) curr.__vue__.value = val;
                    if (curr.__vue__.model !== undefined) curr.__vue__.model = val;
                    if (typeof curr.__vue__.$emit === 'function') { curr.__vue__.$emit('input', val); curr.__vue__.$emit('change', val); }
                } catch(e){}
            }
            curr = curr.parentElement; limit--;
        }
    }

    function dataForTab(id) {
        for (var i = 0; i < tabs.length; i++) { if (tabs[i].id === id) return tabs[i].data; }
        return {};
    }

    /* ══════════════════════════════════════════════════════════
       TOAST
    ══════════════════════════════════════════════════════════ */
    function showToast(msg, icon, isErr) {
        toast.innerHTML = '<span class="dbg-toast-icon">' + (icon||'✓') + '</span>' + msg;
        toast.classList.toggle('dbg-toast-err', !!isErr);
        toast.classList.add('dbg-toast-show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function(){ toast.classList.remove('dbg-toast-show'); }, 1900);
    }

    /* ══════════════════════════════════════════════════════════
       DIRTY STATE — syncs all indicators
    ══════════════════════════════════════════════════════════ */
    function updateDirtyState() {
        var n     = pendingMutations.length;
        var dirty = n > 0;

        /* FAB */
        fabBadge.textContent = n;
        fabBadge.classList.toggle('dbg-visible', dirty);
        fab.classList.toggle('dbg-dirty', dirty);

        /* title bar continue button */
        var contBtn = document.getElementById('dbg-btn-continue');
        if (contBtn) {
            contBtn.classList.toggle('dbg-dirty', dirty);
            if (dirty) {
                contBtn.innerHTML = SVG_SAVE + '&nbsp;Save &amp; Continue (' + n + ') \u2192';
                contBtn.title = 'Apply ' + n + ' staged change' + (n!==1?'s':'') + ' and advance the journey';
                contBtn.disabled = false;
            } else {
                contBtn.textContent = 'Continue \u2192';
                contBtn.title = 'Continue without changes';
                contBtn.disabled = false;
            }
        }

        /* drawer header pill */
        var pill = document.getElementById('dbg-drawer-pill');
        if (pill) {
            pill.classList.toggle('dbg-visible', dirty);
            pill.textContent = n + ' staged';
        }

        /* drawer status strip */
        var strip = document.getElementById('dbg-drawer-status');
        if (strip) {
            strip.className = 'dbg-drawer-status ' + (dirty ? 'dbg-status-dirty' : 'dbg-status-clean');
            strip.innerHTML = dirty
                ? '<strong>' + n + ' change' + (n!==1?'s':'') + ' staged</strong> — click <em>Save &amp; Continue</em> in the title bar to apply.'
                : 'No staged changes — journey will continue as-is.';
        }

        /* staged section in drawer */
        var sec = document.getElementById('dbg-staged-section');
        if (sec) sec.classList.toggle('dbg-visible', dirty);

        /* rebuild stagedKeys map */
        stagedKeys = {};
        for (var i = 0; i < pendingMutations.length; i++) {
            var rootKey = pendingMutations[i].key.split('.')[0];
            stagedKeys[rootKey] = true;
        }
    }

    /* ══════════════════════════════════════════════════════════
       STAGED LIST RENDER
    ══════════════════════════════════════════════════════════ */
    function refreshStagedList() {
        var badge = document.getElementById('dbg-staged-badge');
        var list  = document.getElementById('dbg-staged-list');
        if (!badge || !list) return;
        badge.textContent = pendingMutations.length;
        list.innerHTML = '';
        for (var i = 0; i < pendingMutations.length; i++) {
            (function(idx) {
                var mut  = pendingMutations[idx];
                var item = document.createElement('div');
                item.className = 'dbg-staged-item dbg-action-' + mut.action;
                var act = document.createElement('span'); act.className = 'dbg-staged-action'; act.textContent = mut.action;
                var key = document.createElement('span'); key.className = 'dbg-staged-key'; key.textContent = mut.key; key.title = mut.key;
                var rm  = document.createElement('button'); rm.type='button'; rm.className='dbg-staged-remove'; rm.title='Remove'; rm.textContent='✕';
                rm.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); removeMutation(idx); });
                item.appendChild(act); item.appendChild(key); item.appendChild(rm);
                list.appendChild(item);
            })(i);
        }
    }

    function removeMutation(idx) {
        pendingMutations.splice(idx, 1);
        syncMutationsInput();
        refreshStagedList();
        updateDirtyState();
        showToast('Staged change removed', '✕');
    }

    /* ══════════════════════════════════════════════════════════
       MUTATIONS INPUT SYNC
    ══════════════════════════════════════════════════════════ */
    function syncMutationsInput() {
        var input = getMutationsInput();
        if (input) {
            var valStr = JSON.stringify(pendingMutations);
            input.value = valStr;
            updateVueModel(input, valStr);
            try { input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } catch(e){}
        }
    }

    /* ══════════════════════════════════════════════════════════
       ADD MUTATION
    ══════════════════════════════════════════════════════════ */
    function addMutation(actionType, key, value, merge) {
        /* if duplicate put key exists, replace it */
        if (actionType === 'put') {
            for (var i = 0; i < pendingMutations.length; i++) {
                if (pendingMutations[i].action === 'put' && pendingMutations[i].key === key) {
                    pendingMutations.splice(i, 1); break;
                }
            }
        }
        pendingMutations.push({ action: actionType, key: key, value: value, merge: !!merge });
        syncMutationsInput();

        /* apply locally to tree */
        if (actionType === 'put') {
            if (key.indexOf('.') !== -1) {
                var parts = key.split('.'), temp = nodeStateData;
                for (var i = 0; i < parts.length-1; i++) { if (!temp[parts[i]] || typeof temp[parts[i]] !== 'object') temp[parts[i]] = {}; temp = temp[parts[i]]; }
                var last = parts[parts.length-1];
                if (merge && typeof temp[last]==='object' && temp[last]!==null && typeof value==='object' && value!==null) { for (var k in value) temp[last][k]=value[k]; }
                else temp[last] = value;
            } else {
                if (merge && typeof nodeStateData[key]==='object' && nodeStateData[key]!==null && typeof value==='object' && value!==null) { for (var k in value) nodeStateData[key][k]=value[k]; }
                else nodeStateData[key] = value;
            }
        } else if (actionType === 'remove') {
            if (key.indexOf('.') !== -1) {
                var parts = key.split('.'), temp = nodeStateData;
                for (var i = 0; i < parts.length-1; i++) { if (temp && temp[parts[i]]) temp=temp[parts[i]]; else { temp=null; break; } }
                if (temp) delete temp[parts[parts.length-1]];
            } else { delete nodeStateData[key]; }
        }

        render();
        refreshStagedList();
        updateDirtyState();
        showToast('Change staged', '●');
    }

    /* ══════════════════════════════════════════════════════════
       GET MUTATIONS INPUT
    ══════════════════════════════════════════════════════════ */
    function getMutationsInput() {
        if (mutationsInput && document.body.contains(mutationsInput)) return mutationsInput;
        var inputs = document.querySelectorAll('input, textarea'), found = null;
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.id==='nodeStateMutations'||inp.name==='nodeStateMutations'||inp.placeholder==='nodeStateMutations'||inp.getAttribute('data-callback-prompt')==='nodeStateMutations') { found=inp; break; }
        }
        if (!found) {
            for (var i = 0; i < inputs.length; i++) {
                var inp=inputs[i], parent=inp.parentElement, depth=0;
                while (parent && parent!==document.body && depth<5) {
                    if (parent.textContent && parent.textContent.indexOf('nodeStateMutations')!==-1) { found=inp; break; }
                    parent=parent.parentElement; depth++;
                }
                if (found) break;
            }
        }
        if (found) {
            mutationsInput = found;
            try {
                mutationsInput.style.setProperty('display','none','important');
                var wrapper = mutationsInput.closest('.callback-component')||mutationsInput.closest('.form-group')||mutationsInput.parentElement;
                if (wrapper && wrapper!==document.body && wrapper.id!=='debug-wrapper') wrapper.style.setProperty('display','none','important');
            } catch(e){}
        }
        return mutationsInput;
    }

    /* ══════════════════════════════════════════════════════════
       DRAWER OPEN / CLOSE
    ══════════════════════════════════════════════════════════ */
    function openDrawer(prefillKey, prefillVal, prefillType) {
        drawerOpen = true;
        drawer.classList.add('dbg-drawer-open');
        fab.style.display = 'none';
        refreshKeyDatalist();
        /* enable/disable stage button based on whether a key is pre-filled */
        var sb = document.getElementById('dbg-mut-submit');
        if (sb) sb.disabled = !(prefillKey && prefillKey.trim());
        if (prefillKey !== undefined) {
            document.getElementById('dbg-mut-key').value = prefillKey || '';
            document.getElementById('dbg-mut-val').value = prefillVal !== undefined ? prefillVal : '';
            document.getElementById('dbg-mut-type').value = prefillType || 'string';
            updateValPreview();
            checkDupWarn();
        }
        setTimeout(function(){
            var el = document.getElementById(prefillKey ? 'dbg-mut-val' : 'dbg-mut-key');
            if (el) el.focus();
        }, 270);
    }
    function closeDrawer() {
        drawerOpen = false;
        drawer.classList.remove('dbg-drawer-open');
        if (activeTab === 'nodestate') fab.style.display = 'flex';
    }

    /* ══════════════════════════════════════════════════════════
       KEY DATALIST
    ══════════════════════════════════════════════════════════ */
    function refreshKeyDatalist() {
        var dl = document.getElementById('dbg-key-list'); dl.innerHTML = '';
        var keys = Object.keys(nodeStateData);
        for (var i = 0; i < keys.length; i++) {
            var opt = document.createElement('option'); opt.value = keys[i]; dl.appendChild(opt);
            if (nodeStateData[keys[i]] && typeof nodeStateData[keys[i]] === 'object') {
                var sub = Object.keys(nodeStateData[keys[i]]);
                for (var j = 0; j < sub.length; j++) {
                    var o2 = document.createElement('option'); o2.value = keys[i]+'.'+sub[j]; dl.appendChild(o2);
                }
            }
        }
    }

    /* ══════════════════════════════════════════════════════════
       DUPLICATE KEY WARNING
    ══════════════════════════════════════════════════════════ */
    function checkDupWarn() {
        var key    = document.getElementById('dbg-mut-key').value.trim();
        var keyEl  = document.getElementById('dbg-mut-key');
        var warnEl = document.getElementById('dbg-dup-warn');
        var isDup  = false;
        if (key) {
            for (var i = 0; i < pendingMutations.length; i++) {
                if (pendingMutations[i].action === 'put' && pendingMutations[i].key === key) { isDup = true; break; }
            }
        }
        warnEl.classList.toggle('dbg-visible', isDup);
        keyEl.classList.toggle('dbg-input-warn', isDup);
    }

    /* ══════════════════════════════════════════════════════════
       VALUE PARSE PREVIEW
    ══════════════════════════════════════════════════════════ */
    function updateValPreview() {
        var type    = document.getElementById('dbg-mut-type').value;
        var raw     = document.getElementById('dbg-mut-val').value.trim();
        var preview = document.getElementById('dbg-val-preview');
        if (!raw || type === 'string') { preview.classList.remove('dbg-preview-show'); return; }
        preview.classList.add('dbg-preview-show');
        try {
            var parsed;
            if (type === 'number')       { parsed = Number(raw); if (isNaN(parsed)) throw new Error('Not a number'); preview.textContent = '→ ' + parsed; }
            else if (type === 'boolean') { parsed = raw.toLowerCase()==='true'; preview.textContent = '→ ' + parsed; }
            else if (type === 'json')    { parsed = JSON.parse(raw); preview.textContent = '→ ' + JSON.stringify(parsed).substring(0,80); }
            preview.className = 'dbg-val-preview dbg-preview-show';
        } catch(err) {
            preview.textContent = '✕ ' + err.message;
            preview.className = 'dbg-val-preview dbg-preview-show dbg-preview-err';
        }
    }

    /* ══════════════════════════════════════════════════════════
       STAGE FORM SUBMIT
    ══════════════════════════════════════════════════════════ */
    function applyMutationForm() {
        var key   = document.getElementById('dbg-mut-key').value.trim();
        var type  = document.getElementById('dbg-mut-type').value;
        var merge = document.getElementById('dbg-mut-merge').checked;
        var raw   = document.getElementById('dbg-mut-val').value;
        if (!key) { showToast('Key is required', '✕', true); document.getElementById('dbg-mut-key').focus(); return; }
        if (type !== 'string' && raw.trim() === '') { showToast('Value is required for type ' + type, '✕', true); document.getElementById('dbg-mut-val').focus(); return; }
        var parsed;
        try {
            if (type==='number')       { parsed=Number(raw); if(isNaN(parsed)) throw new Error('Not a number'); }
            else if (type==='boolean') { parsed=raw.toLowerCase()==='true'; }
            else if (type==='json')    { parsed=JSON.parse(raw); }
            else                       { parsed=raw; }
        } catch(err) { showToast('Value error: '+err.message, '✕', true); return; }
        addMutation('put', key, parsed, merge);
        document.getElementById('dbg-mut-key').value  = '';
        document.getElementById('dbg-mut-val').value  = '';
        document.getElementById('dbg-mut-merge').checked = false;
        document.getElementById('dbg-val-preview').classList.remove('dbg-preview-show');
        document.getElementById('dbg-dup-warn').classList.remove('dbg-visible');
        document.getElementById('dbg-mut-key').classList.remove('dbg-input-warn');
        document.getElementById('dbg-mut-key').focus();
    }

    /* wire form */
    document.getElementById('dbg-mut-submit').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); applyMutationForm(); });
    document.getElementById('dbg-mut-val').addEventListener('keydown', function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); applyMutationForm(); } });
    document.getElementById('dbg-mut-key').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); document.getElementById('dbg-mut-val').focus(); } });
    document.getElementById('dbg-mut-key').addEventListener('input', checkDupWarn);
    document.getElementById('dbg-mut-val').addEventListener('input', updateValPreview);
    document.getElementById('dbg-mut-type').addEventListener('change', updateValPreview);
    document.getElementById('dbg-clear-all').addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        if (!pendingMutations.length) return;
        nodeStateData = JSON.parse(JSON.stringify(nodeStateDataOriginal));
        pendingMutations = []; syncMutationsInput(); refreshStagedList(); updateDirtyState(); render();
        showToast('All staged changes cleared', '✕');
    });
    document.getElementById('dbg-fab').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openDrawer(); });
    document.getElementById('dbg-drawer-close').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); closeDrawer(); });

    /* ══════════════════════════════════════════════════════════
       DISMISS BANNER
    ══════════════════════════════════════════════════════════ */
    function showDismissBanner() {
        bannerVisible = true;
        var banner = document.getElementById('dbg-dismiss-banner');
        document.getElementById('dbg-banner-count').textContent = pendingMutations.length;
        banner.classList.add('dbg-banner-visible');
    }
    function hideDismissBanner() {
        bannerVisible = false;
        document.getElementById('dbg-dismiss-banner').classList.remove('dbg-banner-visible');
    }
    document.getElementById('dbg-banner-save').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); hideDismissBanner(); submitJourney(); });
    document.getElementById('dbg-banner-discard').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); hideDismissBanner(); dismissJourney(); });
    document.getElementById('dbg-banner-cancel').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); hideDismissBanner(); });

    /* ══════════════════════════════════════════════════════════
       JOURNEY NAVIGATION
    ══════════════════════════════════════════════════════════ */
    function submitJourney() {
        var input = getMutationsInput();
        if (input && pendingMutations.length > 0) {
            var valStr = JSON.stringify(pendingMutations);
            input.value = valStr; updateVueModel(input, valStr);
            try { input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } catch(e){}
        }
        _advance();
    }
    function dismissJourney() {
        if (pendingMutations.length > 0 && !bannerVisible) { showDismissBanner(); return; }
        /* restore nodeStateData to original snapshot so tree reverts */
        nodeStateData = JSON.parse(JSON.stringify(nodeStateDataOriginal));
        pendingMutations = [];
        syncMutationsInput();
        refreshStagedList();
        updateDirtyState();
        render();
        var input = getMutationsInput();
        if (input) { input.value=''; updateVueModel(input,''); try { input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } catch(e){} }
        _advance();
    }
    function _advance() {
        setTimeout(function(){
            var btn = document.getElementById('loginButton_0') || document.querySelector('button[type=submit]') || document.querySelector('input[type=submit]');
            if (btn) { btn.click(); return; }
            var form = debugWrapper.closest('form');
            if (form) { try { var ev=new Event('submit',{cancelable:true,bubbles:true}); form.dispatchEvent(ev); if(!ev.defaultPrevented) form.submit(); } catch(e){ form.submit(); } }
        }, 100);
    }

    document.getElementById('dbg-btn-continue').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); submitJourney(); });
    document.getElementById('dbg-btn-dismiss').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); dismissJourney(); });
    document.getElementById('dbg-overlay').addEventListener('click', function(e){ if(e.target===this){ e.preventDefault(); e.stopPropagation(); dismissJourney(); } });

    /* ══════════════════════════════════════════════════════════
       TAB SWITCHING
    ══════════════════════════════════════════════════════════ */
    function activateTab(id) {
        if (activeTab === id) return;
        if (drawerOpen) closeDrawer();
        var wasNodeState = (activeTab === 'nodestate');
        activeTab = id;
        for (var i = 0; i < tabs.length; i++) {
            var el = document.getElementById('tab-'+tabs[i].id);
            if (el) el.classList.toggle('dbg-tab-active', tabs[i].id===id);
        }
        searchEl.value=''; clearBtn.style.display='none';
        /* show warning strip if leaving nodestate with staged changes */
        var warn = document.getElementById('dbg-tab-warning');
        if (warn) warn.classList.toggle('dbg-visible', wasNodeState && pendingMutations.length > 0 && id !== 'nodestate');
        render();
    }

    document.getElementById('tab-'+activeTab).classList.add('dbg-tab-active');
    for (var ti = 0; ti < tabs.length; ti++) {
        (function(t){
            var el = document.getElementById('tab-'+t.id);
            if (el) el.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); activateTab(t.id); });
        })(tabs[ti]);
    }

    /* ══════════════════════════════════════════════════════════
       JSON TREE
    ══════════════════════════════════════════════════════════ */
    function maxDepth(obj, d) {
        d = d||0;
        if (obj===null||typeof obj!=='object') return d;
        var m=d, ks=Object.keys(obj);
        for (var i=0;i<ks.length;i++) { var r=maxDepth(obj[ks[i]],d+1); if(r>m) m=r; }
        return m;
    }
    function rawValue(v) { if(v===null) return 'null'; if(typeof v==='string') return v; return String(v); }

    function inferType(v) {
        if (v===null) return 'json';
        if (typeof v==='number')  return 'number';
        if (typeof v==='boolean') return 'boolean';
        if (typeof v==='object')  return 'json';
        return 'string';
    }
    function valToEditString(v) {
        if (typeof v==='object' && v!==null) return JSON.stringify(v, null, 2);
        if (v===null) return 'null';
        return String(v);
    }

    function createNode(key, value, path) {
        path = path||'';
        var currentPath = path ? (key!==null ? path+'.'+key : path) : (key!==null ? key : '');
        var rootKey = currentPath.split('.')[0];
        var wrap = document.createElement('div'); wrap.className = 'dbg-node';
        /* amber staged border on top-level nodes */
        if (activeTab==='nodestate' && key!==null && !path && stagedKeys[currentPath]) {
            wrap.classList.add('dbg-node-staged');
        }

        if (key !== null) {
            var kEl = document.createElement('span'); kEl.className='dbg-node-key'; kEl.textContent='"'+key+'"'; wrap.appendChild(kEl);

            if (activeTab === 'nodestate') {
                /* SVG edit button */
                var editBtn = document.createElement('span'); editBtn.className='dbg-node-editbtn'; editBtn.title='Edit (click)'; editBtn.innerHTML='<span class="dbg-pencil-icon"></span>';
                editBtn.addEventListener('click', (function(p,v){ return function(e){ e.stopPropagation(); openDrawer(p, valToEditString(v), inferType(v)); }; })(currentPath, value));
                wrap.appendChild(editBtn);

                /* delete button */
                var delBtn = document.createElement('span'); delBtn.className='dbg-node-delbtn'; delBtn.title='Delete'; delBtn.textContent='✕';
                delBtn.addEventListener('click', (function(p){ return function(e){ e.stopPropagation(); if(confirm('Delete "'+p+'"?')) addMutation('remove', p); }; })(currentPath));
                wrap.appendChild(delBtn);
            }

            var col = document.createElement('span'); col.className='dbg-node-colon'; col.textContent=': '; wrap.appendChild(col);
        }

        if (value === null) {
            var nEl = document.createElement('span'); nEl.className='dbg-val-null'; nEl.textContent='null'; nEl.title='Click to copy';
            nEl.addEventListener('click', function(e){ e.stopPropagation(); copyText('null'); });
            wrap.appendChild(nEl);
        } else if (typeof value === 'object') {
            var isArr=Array.isArray(value), ks=Object.keys(value);
            var tog=document.createElement('span'); tog.className='dbg-toggle'; wrap.appendChild(tog);
            var openB=document.createElement('span'); openB.className='dbg-brace'; openB.textContent=isArr?'[':'{'; wrap.appendChild(openB);
            var ell=document.createElement('span'); ell.className='dbg-ellipsis'; ell.textContent=' \u2026 '+ks.length+(isArr?' items':' keys')+' '; wrap.appendChild(ell);
            var kids=document.createElement('div'); kids.className='dbg-children'; kids.style.paddingLeft='16px';
            for (var i=0;i<ks.length;i++) {
                var child=createNode(isArr?null:ks[i], value[ks[i]], currentPath);
                if (i<ks.length-1) { var comma=document.createElement('span'); comma.className='dbg-brace'; comma.textContent=','; child.appendChild(comma); }
                kids.appendChild(child);
            }
            wrap.appendChild(kids);
            var closeB=document.createElement('span'); closeB.className='dbg-brace'; closeB.textContent=isArr?']':'}'; wrap.appendChild(closeB);
            wrap.classList.add('dbg-expanded');
            var toggleFn=(function(wr){ return function(e){ if(e){ e.preventDefault(); e.stopPropagation(); } wr.classList.toggle('dbg-collapsed'); }; })(wrap);
            tog.addEventListener('click',toggleFn); ell.addEventListener('click',toggleFn);
            /* clicking object node itself opens editor pre-filled (nodestate only) */
            if (activeTab==='nodestate' && key!==null) {
                openB.style.cursor='default';
            }
        } else {
            var vEl=document.createElement('span');
            var raw=rawValue(value);
            if (typeof value==='string')       { vEl.className='dbg-val-string';  vEl.textContent='"'+value+'"'; }
            else if (typeof value==='number')  { vEl.className='dbg-val-number';  vEl.textContent=String(value); }
            else if (typeof value==='boolean') { vEl.className='dbg-val-boolean'; vEl.textContent=String(value); }
            /* clicking a leaf value: copy it, AND if nodestate open editor pre-filled */
            vEl.title = activeTab==='nodestate' ? 'Click to edit · copy on this tab' : 'Click to copy';
            vEl.addEventListener('click', (function(r, p, v){ return function(e){
                e.stopPropagation();
                if (activeTab==='nodestate' && p) { openDrawer(p, r, inferType(v)); }
                else { copyText(r); }
            }; })(raw, currentPath, value));
            wrap.appendChild(vEl);
        }
        return wrap;
    }

    /* ══════════════════════════════════════════════════════════
       COPY
    ══════════════════════════════════════════════════════════ */
    function copyText(text) {
        navigator.clipboard.writeText(text)
            .then(function(){ showToast('Copied: <strong>'+text.substring(0,40)+(text.length>40?'…':'')+'</strong>', '⎘'); })
            .catch(function(){ showToast('Copy failed','✕',true); });
    }

    /* ══════════════════════════════════════════════════════════
       RENDER
    ══════════════════════════════════════════════════════════ */
    function render() {
        viewer.innerHTML = '';
        var data=dataForTab(activeTab), ks=Object.keys(data);
        if (ks.length===0) {
            viewer.innerHTML='<div class="dbg-empty"><span class="dbg-empty-icon">∅</span>No data in this tab</div>';
        } else {
            viewer.appendChild(createNode(null, data, ''));
        }
        document.getElementById('dbg-stat-keys').textContent  = ks.length;
        document.getElementById('dbg-stat-depth').textContent = maxDepth(data);
        document.getElementById('dbg-result-count').textContent = '';
        fab.style.display = (activeTab==='nodestate' && !drawerOpen) ? 'flex' : 'none';
        applyFilter();
    }

    /* ══════════════════════════════════════════════════════════
       SEARCH / FILTER
    ══════════════════════════════════════════════════════════ */
    function buildMatcher(q) {
        if (!q) return null;
        if (useRegex) { try { return new RegExp(q,'i'); } catch(e){ return null; } }
        var lq=q.toLowerCase();
        return { test: function(s){ return s.toLowerCase().indexOf(lq)!==-1; }, plain: lq };
    }
    function highlightText(el, matcher) {
        var t=el.textContent;
        if (!matcher) { el.innerHTML=t; return; }
        if (matcher.plain!==undefined) {
            var idx=t.toLowerCase().indexOf(matcher.plain);
            if (idx===-1) { el.innerHTML=t; return; }
            el.innerHTML=t.substring(0,idx)+'<span class="dbg-highlight">'+t.substring(idx,idx+matcher.plain.length)+'</span>'+t.substring(idx+matcher.plain.length);
        } else { el.innerHTML=t.replace(matcher, function(m){ return '<span class="dbg-highlight">'+m+'</span>'; }); }
    }
    function applyFilter() {
        var q=searchEl.value.trim(), matcher=buildMatcher(q);
        var all=viewer.querySelectorAll('.dbg-node'), matches=0;
        if (useRegex && q) {
            try { new RegExp(q); searchEl.style.borderColor=''; }
            catch(e) { searchEl.style.borderColor='#f87171'; document.getElementById('dbg-result-count').textContent='invalid regex'; return; }
        } else { searchEl.style.borderColor=''; }
        for (var i=0;i<all.length;i++) {
            var node=all[i];
            var keyEl=node.querySelector(':scope > .dbg-node-key');
            var valEl=node.querySelector(':scope > .dbg-val-string, :scope > .dbg-val-number, :scope > .dbg-val-boolean, :scope > .dbg-val-null');
            if (keyEl) keyEl.innerHTML=keyEl.textContent;
            if (valEl) valEl.innerHTML=valEl.textContent;
            if (!matcher) { node.classList.remove('dbg-hidden'); continue; }
            var km=keyEl&&matcher.test(keyEl.textContent);
            var vm=valEl&&matcher.test(valEl.textContent);
            if (km||vm) {
                node.classList.remove('dbg-hidden'); matches++;
                if(km&&keyEl) highlightText(keyEl,matcher);
                if(vm&&valEl) highlightText(valEl,matcher);
                var p=node.parentElement;
                while(p&&p!==viewer){ if(p.classList.contains('dbg-node')){ p.classList.remove('dbg-hidden','dbg-collapsed'); } p=p.parentElement; }
            } else { node.classList.add('dbg-hidden'); }
        }
        if (q) document.getElementById('dbg-result-count').textContent=matches+' match'+(matches!==1?'es':'');
        else   document.getElementById('dbg-result-count').textContent='';
        clearBtn.style.display = q ? 'block' : 'none';
    }

    function setAllCollapsed(collapse) {
        var nodes=viewer.querySelectorAll('.dbg-node');
        for (var i=0;i<nodes.length;i++) { if(nodes[i].querySelector(':scope > .dbg-children')) nodes[i].classList.toggle('dbg-collapsed',collapse); }
    }

    /* ══════════════════════════════════════════════════════════
       TOOLBAR / HEADER BUTTONS
    ══════════════════════════════════════════════════════════ */
    document.getElementById('dbg-btn-copy').addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(dataForTab(activeTab),null,2))
            .then(function(){ showToast('Full JSON copied','⎘'); }).catch(function(){ showToast('Copy failed','✕',true); });
    });
    document.getElementById('dbg-btn-download').addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        var json=JSON.stringify(dataForTab(activeTab),null,2);
        var blob=new Blob([json],{type:'application/json'});
        var url=URL.createObjectURL(blob);
        var ts=new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
        var filename=titleText+'_'+activeTab+'_'+ts+'.json';
        var a=document.createElement('a'); a.href=url; a.download=filename; a.click();
        setTimeout(function(){ URL.revokeObjectURL(url); },1000);
        showToast('Downloaded '+filename,'⤓');
    });
    var btnMax=document.getElementById('dbg-btn-maximize');
    btnMax.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        isMaximized=!isMaximized;
        panel.classList.toggle('dbg-maximized',isMaximized);
        btnMax.textContent=isMaximized?'⤡':'⤢';
        btnMax.title=isMaximized?'Restore (M)':'Maximize (M)';
    });
    document.getElementById('dbg-btn-expand-all').addEventListener('click',   function(e){ e.preventDefault(); e.stopPropagation(); setAllCollapsed(false); });
    document.getElementById('dbg-btn-collapse-all').addEventListener('click',  function(e){ e.preventDefault(); e.stopPropagation(); setAllCollapsed(true); });
    regexBtn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        useRegex=!useRegex;
        regexBtn.classList.toggle('dbg-regex-active',useRegex);
        regexBtn.title=useRegex?'Regex ON — click to disable':'Toggle regex search';
        searchEl.placeholder=useRegex?'Regex pattern…':'Search keys and values…';
        applyFilter();
    });
    searchEl.addEventListener('input', applyFilter);
    clearBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); searchEl.value=''; clearBtn.style.display='none'; applyFilter(); searchEl.focus(); });

    /* ══════════════════════════════════════════════════════════
       KEYBOARD SHORTCUTS
    ══════════════════════════════════════════════════════════ */
    document.addEventListener('keydown', function(e){
        if (e.key==='Escape') {
            if (bannerVisible) { hideDismissBanner(); return; }
            if (drawerOpen) { closeDrawer(); return; }
            dismissJourney(); return;
        }
        var active=document.activeElement;
        var inInput=active===searchEl||active===document.getElementById('dbg-mut-key')||active===document.getElementById('dbg-mut-val');
        if (inInput) return;
        if (e.key==='c'||e.key==='C') document.getElementById('dbg-btn-copy').click();
        if (e.key==='d'||e.key==='D') document.getElementById('dbg-btn-download').click();
        if (e.key==='m'||e.key==='M') btnMax.click();
        if ((e.key==='e'||e.key==='E') && activeTab==='nodestate') { if(drawerOpen) closeDrawer(); else openDrawer(); }
    });

    /* ══════════════════════════════════════════════════════════
       INIT
    ══════════════════════════════════════════════════════════ */
    render();
    updateDirtyState();

})();`;

    callbacksBuilder.scriptTextOutputCallback(clientScript);
}
