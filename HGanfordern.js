// ==UserScript==
// @name          Tribal Wars Smart Resource Request (Anfrage Helfer) (V.2.23)
// @namespace     http://tampermonkey.net/
// @version       2.23 // Fix: Prod-Modus: Eingehende Transporte werden nach JEDER Sendung neu abgerufen, um Überlieferung zu vermeiden.
// @description   Ein Skript für Tribal Wars, das intelligent Ressourcen für Gebäude anfordert, mit Optionen für Dorfgruppen, maximale Mengen pro Dorf und Mindestbestände.
// @author        PhilJor93 - Generiert mithilfe von Google Gemini KI
// @match         https://*.tribalwars.*/game.php*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // *** WICHTIG: Hier wird der Debug-Modus aus der globalen Variable gelesen. ***
    // window.HGA_DEBUG wird über den Schnellleisten-Aufruf gesetzt (z.B. javascript:window.HGA_DEBUG=true; $.getScript(...))
    // Standardmäßig ist es false, wenn die Variable nicht gesetzt ist.
    const DEBUG_MODE = window.HGA_DEBUG === true;

    const SCRIPT_VERSION = '2.23' + (DEBUG_MODE ? ' - DEBUG MODE' : ' - PRODUCTIVE MODE');

    // --- Globale Variablen für das Skript ---
    var sources = []; // Speichert alle potenziellen Quelldörfer und deren Daten
    var resourcesNeeded = []; // Speichert die Bedarfe der Gebäude im aktuellen Dorf

    // Diese Variablen verfolgen die theoretischen Ressourcen des aktuellen Dorfes,
    // einschließlich der bereits angeforderten, aber noch nicht angekommenen Ressourcen.
    var currentTheoreticalWood = 0;
    var currentTheoreticalStone = 0;
    var currentTheoreticalIron = 0;
    var WHCap = 0; // Maximale Lagerkapazität des aktuellen Dorfes

    // Variablen für eingehende Transporte (werden initial echt abgerufen, dann je nach Modus simuliert/echt aktualisiert)
    var actualIncomingWood = 0;
    var actualIncomingStone = 0;
    var actualIncomingIron = 0;

    // Für Debug-Modus: Speichert die ZULETZT ECHT abgerufenen eingehenden Transporte
    // Wird nur im DEBUG_MODE verwendet, um die tatsächlichen Werte im Log anzuzeigen,
    // während currentTheoretical... und actualIncoming... simuliert weiterlaufen.
    var lastActualIncomingWood = 0;
    var lastActualIncomingStone = 0;
    var lastActualIncomingIron = 0;


    // --- Einstellungen und Speicher-Schlüssel ---
    var scriptSettings = {
        selectedGroupId: '0', // Standard: 'Alle Dörfer'
        maxSendWood: 0,       // Standard: Keine Begrenzung (wird intern als Gesamtbedarf behandelt, nicht unbegrenzt)
        maxSendStone: 0,
        maxSendIron: 0,
        minWood: 10000,       // Mindestmenge Holz im Quelldorf
        minStone: 10000,      // Mindestmenge Lehm im Quelldorf
        minIron: 10000        // Mindestmenge Eisen im Quelldorf
    };
    const STORAGE_KEY = 'hgholen_smart_request_settings';

    // --- Hilfsfunktion für Logging (abhängig von DEBUG_MODE) ---
    function logDebug(message, ...args) {
        if (DEBUG_MODE) {
            console.log("DEBUG: " + message, ...args);
        }
    }

    function logWarn(message, ...args) {
        if (DEBUG_MODE) {
            console.warn("DEBUG WARN: " + message, ...args);
        } else {
            console.warn("WARN: " + message, ...args);
        }
    }

    function logError(message, ...args) {
        console.error("ERROR: " + message, ...args);
    }

    // --- Einstellungen speichern/laden ---
    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(scriptSettings));
            UI.InfoMessage('Einstellungen gespeichert.', 2000);
            logDebug("Einstellungen gespeichert.", scriptSettings);
        } catch (e) {
            logError("Fehler beim Speichern der Einstellungen:", e);
            UI.ErrorMessage('Fehler beim Speichern der Einstellungen.', 3000);
        }
    }

    function loadSettings() {
        const storedSettings = localStorage.getItem(STORAGE_KEY);
        if (storedSettings) {
            try {
                const parsed = JSON.parse(storedSettings);
                // Parsed-Werte sicher in scriptSettings übernehmen, mit Fallback auf Standardwerte
                scriptSettings.selectedGroupId = parsed.selectedGroupId || '0';
                scriptSettings.maxSendWood = parseInt(parsed.maxSendWood) || 0;
                scriptSettings.maxSendStone = (parsed.maxSendStone !== undefined && !isNaN(parseInt(parsed.maxStone))) ? parseInt(parsed.maxStone) : (parseInt(parsed.maxSendStone) || 0);
                scriptSettings.maxSendIron = (parsed.maxSendIron !== undefined && !isNaN(parseInt(parsed.maxIron))) ? parseInt(parsed.maxIron) : (parseInt(parsed.maxSendIron) || 0);

                // Neue Mindestmengen-Einstellungen mit Fallback auf 10000, falls nicht vorhanden oder ungültig
                scriptSettings.minWood = (parsed.minWood !== undefined && !isNaN(parseInt(parsed.minWood))) ? parseInt(parsed.minWood) : 10000;
                scriptSettings.minStone = (parsed.minStone !== undefined && !isNaN(parseInt(parsed.minStone))) ? parseInt(parsed.minStone) : 10000;
                scriptSettings.minIron = (parsed.minIron !== undefined && !isNaN(parseInt(parsed.minIron))) ? parseInt(parsed.minIron) : 10000;
                logDebug("Einstellungen geladen.", scriptSettings);
                return true;
            } catch (e) {
                logError("Fehler beim Laden oder Parsen der Einstellungen. Standardwerte geladen.", e);
                UI.ErrorMessage('Fehler beim Laden der Einstellungen. Standardwerte geladen.', 3000);
                return false;
            }
        }
        logDebug("Keine gespeicherten Einstellungen gefunden. Standardwerte aktiv.", scriptSettings);
        return false;
    }

    // --- Hilfsfunktion zum Abrufen der Dorfgruppen-Optionen ---
    function getGroupOptionsHtml(selectedId) {
        logDebug("Lade Dorfgruppen...");
        return new Promise((resolve, reject) => {
            $.ajax({
                url: TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' }),
                method: 'GET',
                dataType: 'json' // Erwarte JSON-Antwort
            })
            .done(function(data) {
                let html = `<option value="0">Alle Dörfer</option>`;
                if (data && data.result) {
                    data.result.forEach((val) => {
                        if (val.type == 'separator') {
                            html += `<option disabled=""/>`;
                        } else {
                            html += `<option value="${val.group_id}" ${val.group_id == selectedId ? 'selected' : ''}>${val.name}</option>`;
                        }
                    });
                    logDebug("Dorfgruppen erfolgreich geladen.", data.result);
                } else {
                    logWarn("Keine Dorfgruppen aus dem API-Aufruf erhalten oder unerwartetes Format.", data);
                }
                resolve(html);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                logError("Fehler beim Laden der Dorfgruppen:", textStatus, errorThrown, jqXHR);
                UI.ErrorMessage("Fehler beim Laden der Dorfgruppen. Nur 'Alle Dörfer' verfügbar.", 3000);
                resolve(`<option value="0">Alle Dörfer</option>`); // Fallback, falls API-Aufruf fehlschlägt
            });
        });
    }

    // --- Einstellungen-Dialog öffnen ---
    function openSettingsDialog() {
        getGroupOptionsHtml(scriptSettings.selectedGroupId).then((groupOptionsHtml) => {
            const dialogContent = `
                <div>
                    <h3>Einstellungen für Ressourcenanforderung (Version: ${SCRIPT_VERSION})</h3>
                    <table class="vis">
                        <tr>
                            <td>Dorfgruppe auswählen:</td>
                            <td>
                                <select id="resourceGroupSelect" class="input-nicer" style="width: 100%;">
                                    ${groupOptionsHtml}
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <td>Max. Holz pro Dorf:</td>
                            <td><input type="number" id="maxWoodInput" value="${scriptSettings.maxSendWood}" min="0" class="input-nicer"></td>
                        </tr>
                        <tr>
                            <td>Max. Lehm pro Dorf:</td>
                            <td><input type="number" id="maxStoneInput" value="${scriptSettings.maxSendStone}" min="0" class="input-nicer"></td>
                        </tr>
                        <tr>
                            <td>Max. Eisen pro Dorf:</td>
                            <td><input type="number" id="maxIronInput" value="${scriptSettings.maxSendIron}" min="0" class="input-nicer"></td>
                        </tr>
                        <tr>
                            <td>Mindest-Holz im Quelldorf:</td>
                            <td><input type="number" id="minWoodInput" value="${scriptSettings.minWood}" min="0" class="input-nicer"></td>
                        </tr>
                        <tr>
                            <td>Mindest-Lehm im Quelldorf:</td>
                            <td><input type="number" id="minStoneInput" value="${scriptSettings.minStone}" min="0" class="input-nicer"></td>
                        </tr>
                        <tr>
                            <td>Mindest-Eisen im Quelldorf:</td>
                            <td><input type="number" id="minIronInput" value="${scriptSettings.minIron}" min="0" class="input-nicer"></td>
                        </tr>
                    </table>
                    <br>
                    <div style="text-align: center;">
                        <input type="button" class="btn evt-confirm-btn btn-confirm-yes" id="saveSettingsBtn" value="Einstellungen speichern &amp; aktualisieren">
                    </div>
                    <p><small>Hinweis: Eine Limit von 0 (Null) bei "Max. XYZ pro Dorf" bedeutet, dass pro Dorf nur bis zum tatsächlichen Gesamtbedarf des Zieldorfes gesendet wird (keine Überlieferung).<br>
                    Eine Mindestmenge von 0 (Null) bei "Mindest-XYZ im Quelldorf" bedeutet, dass das Quelldorf bis auf 0 entleert werden kann.</small></p>
                </div>
            `;

            Dialog.show("Ressourcen-Anforderung Einstellungen", dialogContent);
            logDebug("Einstellungen-Dialog geöffnet.");

            // Event Listener für den Speichern-Button
            $('#saveSettingsBtn').on('click', function() {
                scriptSettings.selectedGroupId = $('#resourceGroupSelect').val();
                scriptSettings.maxSendWood = parseInt($('#maxWoodInput').val()) || 0;
                scriptSettings.maxSendStone = parseInt($('#maxStoneInput').val()) || 0;
                scriptSettings.maxSendIron = parseInt($('#maxIronInput').val()) || 0;
                scriptSettings.minWood = parseInt($('#minWoodInput').val()) || 0;
                scriptSettings.minStone = parseInt($('#minStoneInput').val()) || 0;
                scriptSettings.minIron = parseInt($('#minIronInput').val()) || 0;
                saveSettings();
                Dialog.close();
                // Hier müssen wir auch die aktuellen Ressourcen neu initialisieren, da die Einstellungen geändert wurden
                initializeCurrentResources(true, true).then(() => { // Beide true, um Info zu unterdrücken und echten Initial-Abruf zu erzwingen
                    showSourceSelect(function() {
                        checkBuildings();
                    });
                });
            });
        });
    }

    /**
     * Helferfunktion zum Parsen von Ressourcenmengen aus Text,
     * bereinigt alle Nicht-Ziffern und extrahiert nur die erste Zahl.
     */
    function parseResourceAmount(text) {
        if (!text) return 0;
        const match = text.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)/);
        if (match && match[1]) {
            const cleanedText = match[1].replace(/[.,]/g, '');
            const parsedValue = parseInt(cleanedText, 10);
            return isNaN(parsedValue) ? 0 : parsedValue;
        }
        return 0;
    }


    /**
     * Ruft die aktuellen Ressourcen des Dorfes ab (inkl. eingehender Transporte vom Server).
     * Setzt `currentTheoretical...` auf diese echten Werte.
     * Im Debug-Modus wird `lastActualIncoming...` für Logging gesetzt.
     * @param {boolean} suppressInfoMessage - Wenn true, wird die Info-Nachricht über eingehende Transporte unterdrückt.
     * @returns {Promise<void>} Ein Promise, das erfüllt wird, wenn die Ressourcen initialisiert sind.
     */
    async function fetchRealIncomingResources(suppressInfoMessage = false) {
        let currentIncomingWood = 0;
        let currentIncomingStone = 0;
        let currentIncomingIron = 0;

        try {
            const marketPage = await $.get(game_data.link_base_pure + "market");
            const $marketPage = $(marketPage);

            const $incomingTextElement = $marketPage.find('*:contains("Eintreffend:")').filter(function() {
                return $(this).text().includes("Eintreffend:");
            }).first();

            if ($incomingTextElement.length > 0) {
                let $containerElement;
                // Versuche, das nächste tr (oder einen anderen passenden Container) zu finden
                $containerElement = $incomingTextElement.closest('tr');
                if ($containerElement.length === 0) {
                     $containerElement = $incomingTextElement.parent(); // Fallback zum direkten Elternteil
                }
                 if ($containerElement.length === 0) {
                    logDebug("Marktplatz: 'Eintreffend:' Text gefunden, aber kein passender TR oder Parent für Ressourcen-Spans.");
                    // Versuche, Icons direkt auf der Marktplatz-Seite zu finden, wenn kein spezifischer Container gefunden wurde
                    // Dies ist eine Fallback-Strategie, falls das Layout anders ist
                    const allSpans = $marketPage.find('span.nowrap');
                    allSpans.each(function() {
                        const $this = $(this);
                        if ($this.find('span.icon.header.wood').length) {
                            currentIncomingWood = parseResourceAmount($this.text());
                        } else if ($this.find('span.icon.header.stone').length) {
                            currentIncomingStone = parseResourceAmount($this.text());
                        } else if ($this.find('span.icon.header.iron').length) {
                            currentIncomingIron = parseResourceAmount($this.text());
                        }
                    });
                } else {
                    const woodSpan = $containerElement.find('span.nowrap:has(span.icon.header.wood)');
                    const stoneSpan = $containerElement.find('span.nowrap:has(span.icon.header.stone)');
                    const ironSpan = $containerElement.find('span.nowrap:has(span.icon.header.iron)');

                    currentIncomingWood = parseResourceAmount(woodSpan.text());
                    currentIncomingStone = parseResourceAmount(stoneSpan.text());
                    currentIncomingIron = parseResourceAmount(ironSpan.text());
                }
                 logDebug(`Marktplatz: Eingehende Transporte (echt) erfasst: Holz: ${currentIncomingWood}, Lehm: ${currentIncomingStone}, Eisen: ${currentIncomingIron}`);

            } else {
                logDebug("Marktplatz: 'Eintreffend:' Text nicht gefunden. Vermutlich keine eingehenden Transporte.");
            }
        } catch (e) {
            logError("Fehler beim Abrufen der Marktplatz-Seite für eingehende Transporte:", e);
            UI.ErrorMessage('Fehler beim Abrufen eingehender Transporte. Bitte manuell prüfen.', 3000);
        }

        // Setze die globalen Variablen für die tatsächlichen eingehenden Transporte
        lastActualIncomingWood = currentIncomingWood;
        lastActualIncomingStone = currentIncomingStone;
        lastActualIncomingIron = currentIncomingIron;

        // Aktualisiere die theoretischen Werte mit den ECHTEN Werten vom Server
        currentTheoreticalWood = game_data.village.wood + lastActualIncomingWood;
        currentTheoreticalStone = game_data.village.stone + lastActualIncomingStone;
        currentTheoreticalIron = game_data.village.iron + lastActualIncomingIron;
        WHCap = game_data.village.storage_max; // Lagerkapazität ist immer gleich

        if (!suppressInfoMessage) {
            if (lastActualIncomingWood + lastActualIncomingStone + lastActualIncomingIron > 0) {
                UI.InfoMessage(`Eingehende Transporte (aktuell): H:${lastActualIncomingWood}, L:${lastActualIncomingStone}, E:${lastActualIncomingIron}.`, 3000);
            } else {
                 UI.InfoMessage(`Keine eingehenden Transporte gefunden.`, 3000);
            }
        }
    }


    /**
     * Initialisiert die aktuellen (theoretischen) Ressourcen des Dorfes.
     * Im Produktivmodus holt es die echten Werte vom Server.
     * Im Debug-Modus werden die Werte der globalen `actualIncoming...` Variablen verwendet (die simuliert werden).
     * @param {boolean} suppressInfoMessage - Wenn true, wird die Info-Nachricht über eingehende Transporte unterdrückt.
     * @param {boolean} forceServerFetchInDebug - Wenn true, wird der Server-Abruf auch im Debug-Modus erzwungen (z.B. für initiale Werte).
     * @returns {Promise<void>} Ein Promise, das erfüllt wird, wenn die Ressourcen initialisiert sind.
     */
    async function initializeCurrentResources(suppressInfoMessage = false, forceServerFetchInDebug = false) {
        logDebug(`initializeCurrentResources aufgerufen. suppressInfoMessage: ${suppressInfoMessage}, forceServerFetchInDebug: ${forceServerFetchInDebug}`);

        if (!DEBUG_MODE || forceServerFetchInDebug) {
            logDebug("PRODUKTIV-Modus oder erzwungener Server-Abruf im DEBUG-Modus: Hole echte eingehende Transporte.");
            await fetchRealIncomingResources(suppressInfoMessage);
            // Im Produktivmodus sind actualIncoming und lastActualIncoming immer dasselbe
            if (!DEBUG_MODE) {
                actualIncomingWood = lastActualIncomingWood;
                actualIncomingStone = lastActualIncomingStone;
                actualIncomingIron = lastActualIncomingIron;
            }
        } else {
            // DEBUG-Modus, keine erzwungene Server-Abfrage: Nutze die simulierten actualIncoming... Werte
            // game_data.village.wood/stone/iron sind immer die echten, die auf der Seite sichtbar sind.
            currentTheoreticalWood = game_data.village.wood + actualIncomingWood;
            currentTheoreticalStone = game_data.village.stone + actualIncomingStone;
            currentTheoreticalIron = game_data.village.iron + actualIncomingIron;
            WHCap = game_data.village.storage_max;

            logDebug(`DEBUG-Modus (simuliert): Theoretische Ressourcen: H:${currentTheoreticalWood}, L:${currentTheoreticalStone}, E:${currentTheoreticalIron}. Lagerkapazität: ${WHCap}`);
            logDebug(`DEBUG-Modus (simuliert): Eingehende Transporte (simuliert): H:${actualIncomingWood}, L:${actualIncomingStone}, E:${actualIncomingIron}.`);
            // Hier zusätzlich die echten Werte loggen, die zuletzt vom Server kamen
            logDebug(`DEBUG-Modus (Vergleich): Eingehende Transporte (echt vom Server zuletzt): H:${lastActualIncomingWood}, L:${lastActualIncomingStone}, E:${lastActualIncomingIron}.`);

            if (!suppressInfoMessage) {
                if (actualIncomingWood + actualIncomingStone + actualIncomingIron > 0) {
                    UI.InfoMessage(`Eingehende Transporte (simuliert): H:${actualIncomingWood}, L:${actualIncomingStone}, E:${actualIncomingIron}.`, 3000);
                } else {
                    UI.InfoMessage(`Keine eingehenden Transporte simuliert.`, 3000);
                }
            }
        }
    }


    // --- Initialisierung des Skripts bei Seitenaufruf ---
    $(document).ready(function() {
        logDebug(`Skript Version ${SCRIPT_VERSION} initialisiert.`);
        // Sicherstellen, dass das Skript auf der Hauptgebäude-Seite ausgeführt wird
        if (window.location.href.indexOf('&screen=main') < 0) {
            logDebug("Nicht auf Hauptgebäude-Seite. Leite um...");
            window.location.assign(game_data.link_base_pure + "main");
            return; // Beende das Skript hier, um doppelte Ausführung nach Weiterleitung zu vermeiden
        }

        // Füge grundlegende CSS-Styles hinzu
        var cssClassesSophie = `
        <style>
        .res{ padding: 1px 1px 1px 18px; }
        .trclass:hover { background: #40D0E0 !important; }
        .trclass:hover td { background: transparent; }
        .input-nicer { width: 90%; padding: 5px; border-radius: 3px; border: 1px solid #ccc; }
        </style>`;
        $("#contentContainer").eq(0).prepend(cssClassesSophie);
        $("#mobileHeader").eq(0).prepend(cssClassesSophie); // Für mobile Ansicht

        // Füge den Einstellungen-Button zur UI hinzu
        $("#building_wrapper").prepend(`
            <div style="text-align: right; margin-bottom: 10px;">
                <input type="button" class="btn evt-confirm-btn btn-confirm-yes" id="openSettingsBtn" value="Einstellungen für Ressourcen">
            </div>
        `);
        $('#openSettingsBtn').on('click', openSettingsDialog);

        // Einstellungen laden und Ressourcen initialisieren
        if (!loadSettings()) {
            initializeCurrentResources(false, true).then(() => { // forceServerFetchInDebug auf true, damit initial die echten Werte geholt werden
                openSettingsDialog(); // Öffne Dialog, um Einstellungen vornehmen zu lassen
            });
        } else {
            initializeCurrentResources(false, true).then(() => { // forceServerFetchInDebug auf true, damit initial die echten Werte geholt werden
                showSourceSelect(function() {
                    checkBuildings();
                });
            });
        }
    });

    /**
     * Prüft alle Gebäude auf der Hauptgebäude-Seite, die nicht genug Ressourcen haben,
     * und fügt einen "Ressourcen anfordern"-Button hinzu.
     */
    function checkBuildings() {
        logDebug("Prüfe Gebäude auf Ressourcenbedarf...");
        resourcesNeeded = []; // Array bei jeder Prüfung leeren
        $("#buildings tr .build_options .inactive").each(function(i) {
            var $inactiveBtn = $(this);
            var $parentRow = $inactiveBtn.parents().eq(1);

            var woodCost = parseInt($parentRow.find("[data-cost]").eq(0).text().trim());
            var stoneCost = parseInt($parentRow.find("[data-cost]").eq(1).text().trim());
            var ironCost = parseInt($parentRow.find("[data-cost]").eq(2).text().trim());

            resourcesNeeded.push({ "wood": woodCost, "stone": stoneCost, "iron": ironCost });

            var $buttonCell = $inactiveBtn.parent().parent();
            // Vorhandenen Button entfernen, um Duplikate zu vermeiden, falls das Skript erneut läuft
            $buttonCell.find('td[id^="request"]').remove();

            if ($inactiveBtn.text().trim() !== 'Das Lager ist zu klein') {
                $buttonCell.append(`<td id="request${i}"><input type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="requestRes(${i})" value="Ressourcen anfordern"></td>`);
                logDebug(`Gebäude ${i} benötigt Ressourcen (Kosten H:${woodCost}, L:${stoneCost}, E:${ironCost}). Button hinzugefügt.`);
            } else {
                $buttonCell.append(`<td id="request${i}"><input type="button" class="btn btn-disabled" value="Lager zu klein"></td>`);
                logDebug(`Gebäude ${i} kann nicht gebaut werden (Lager zu klein). Button deaktiviert.`);
            }
        });
        logDebug("Gebäudeüberprüfung abgeschlossen. Benötigte Ressourcen-Arrays:", resourcesNeeded);
    }

    /**
     * Fordert Ressourcen für ein bestimmtes Gebäude intelligent aus der Dorfgruppe an.
     * Berücksichtigt Einstellungen für maximale Mengen pro Dorf, Mindestbestände und Lagerkapazität.
     * Gibt Informationen per Alert aus und sendet Ressourcen.
     * @param {number} buildingNr - Der Index des Gebäudes im resourcesNeeded-Array.
     */
    window.requestRes = async function(buildingNr) { // window. zur globalen Verfügbarkeit, async für await
        logDebug(`--- Anforderung für Gebäude ${buildingNr} gestartet ---`);

        // WICHTIG: Vor jeder Anforderung aktualisieren wir die theoretischen Ressourcen.
        // Im Prod-Modus wird dies eine Server-Anfrage sein, im Debug-Modus wird es simuliert.
        await initializeCurrentResources(true);

        logDebug(`[INFO]: Aktueller Lagerbestand (Holz/Lehm/Eisen): ${game_data.village.wood}/${game_data.village.stone}/${game_data.village.iron}`);
        logDebug(`[INFO]: Eingehende Transporte (vom Skript aktuell berücksichtigt): H:${actualIncomingWood}, L:${actualIncomingStone}, E:${actualIncomingIron}`);
        logDebug(`[INFO]: Theoretischer Gesamtbestand (inkl. aktuell + eingehend): H:${currentTheoreticalWood}, L:${currentTheoreticalStone}, E:${currentTheoreticalIron}`);
        logDebug(`[INFO]: Max. Lagerkapazität: ${WHCap}`);
        logDebug(`[INFO]: Verfügbarer Lagerplatz (pro Ressource): H:${WHCap - currentTheoreticalWood}, L:${WHCap - currentTheoreticalStone}, E:${WHCap - currentTheoreticalIron}`);

        if (DEBUG_MODE) {
            logDebug(`[DEBUG-VERGLEICH]: Echte eingehende Transporte vom Server (zuletzt abgerufen): H:${lastActualIncomingWood}, L:${lastActualIncomingStone}, E:${lastActualIncomingIron}`);
        }

        // Der aktuelle Bedarf wird HIER immer neu berechnet, basierend auf dem aktuellen theoretischen Stand.
        let currentNeeded = {
            wood: Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood),
            stone: Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone),
            iron: Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron)
        };

        logDebug(`Benötigter Bedarf für Gebäude ${buildingNr} (berechnet auf Basis des theoretischen Bestands): H:${currentNeeded.wood}, L:${currentNeeded.stone}, E:${currentNeeded.iron}`);

        if (currentNeeded.wood <= 0 && currentNeeded.stone <= 0 && currentNeeded.iron <= 0) {
            UI.InfoMessage('Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!', 2000);
            $(`td[id='request${buildingNr}']`).remove(); // Button entfernen, wenn Ressourcen gedeckt
            logDebug("Bedarf bereits gedeckt. Beende Anforderung.");
            return;
        }

        // Lagerkapazitätsprüfung (verwendet den aktuellen, sich aktualisierenden currentTheoretical... Wert)
        if (currentTheoreticalWood + currentNeeded.wood > WHCap ||
            currentTheoreticalStone + currentNeeded.stone > WHCap ||
            currentTheoreticalIron + currentNeeded.iron > WHCap) {
             UI.ErrorMessage("Nicht genug Lagerplatz im Ziel-Dorf für die benötigten Ressourcen (bereits angeforderte Ressourcen berücksichtigt)!", 4000);
             logWarn("Nicht genug Lagerplatz im Zieldorf. Anforderung abgebrochen.");
             return;
         }

        let totalSentPotential = { wood: 0, stone: 0, iron: 0 }; // Verfolgt, was TATSÄCHLICH gesendet wird (im Debug-Modus simuliert)
        let sourcesToUpdate = {}; // Verfolgt die neuen Ressourcenstände der Quelldörfer

        // Erstelle eine tiefe Kopie der Quelldörfer für diese Anforderung
        let availableSources = JSON.parse(JSON.stringify(sources));

        // Sortiere Quellen nach Entfernung (näher ist besser)
        availableSources.sort((a, b) => a.distance - b.distance);

        // Die Hauptschleife: Iteriere durch die Quelldörfer und versuche, von jedem Dorf mehrere Ressourcen gleichzeitig zu senden
        for (let i = 0; i < availableSources.length; i++) {
            let source = availableSources[i];

            // Wenn der gesamte Bedarf gedeckt ist, beende die Schleife
            if (currentNeeded.wood <= 0 && currentNeeded.stone <= 0 && currentNeeded.iron <= 0) {
                logDebug("Gesamter Bedarf gedeckt. Beende die Suche nach weiteren Quelldörfern.");
                break;
            }

            // Prüfe, ob das Quelldorf noch genügend Händler hat
            if (source.merchants < 1) {
                logDebug(`Dorf ${source.name} hat keine Händler mehr. Überspringe.`);
                continue;
            }

            let payload = { wood: 0, stone: 0, iron: 0 };
            let merchantsNeededForPayload = 0; // Händler für die aktuelle payload dieses Dorfes
            const resourceTypes = ['wood', 'stone', 'iron'];
            let potentialSendAmounts = {}; // Temporäre Speicherung der berechneten Mengen pro Ressource

            // 1. Phase: Berechne, wie viel von jeder Ressource dieses Dorf potenziell senden KÖNNTE,
            // unter Berücksichtigung des Bedarfs, der Mindestbestände und der Max-Send-Einstellungen.
            for (const resType of resourceTypes) {
                let sendAmountForRes = 0;
                // Wichtig: Hier wird currentNeeded verwendet, das sich kontinuierlich aktualisiert
                if (currentNeeded[resType] > 0) {
                    let availableFromSource = source[resType] - scriptSettings[`min${resType.charAt(0).toUpperCase() + resType.slice(1)}`];
                    if (availableFromSource < 0) availableFromSource = 0;

                    if (availableFromSource > 0) {
                        sendAmountForRes = Math.min(currentNeeded[resType], availableFromSource);
                        const maxSendSetting = scriptSettings[`maxSend${resType.charAt(0).toUpperCase() + resType.slice(1)}`];
                        if (maxSendSetting > 0) {
                            sendAmountForRes = Math.min(sendAmountForRes, maxSendSetting);
                        }
                    }
                }
                potentialSendAmounts[resType] = sendAmountForRes;
                merchantsNeededForPayload += Math.ceil(sendAmountForRes / 1000);
            }

            // 2. Phase: Passe die Sendemengen an die verfügbaren Händler des Dorfes an.
            // Wenn die Summe der benötigten Händler für alle Ressourcen die verfügbaren Händler übersteigt,
            // reduziere die Sendemengen proportional.
            if (merchantsNeededForPayload > source.merchants && merchantsNeededForPayload > 0) {
                let reductionFactor = source.merchants / merchantsNeededForPayload;
                logDebug(`Dorf ${source.name} hat nicht genug Händler für alle potenziellen Ressourcen. Reduktionsfaktor: ${reductionFactor.toFixed(2)}. Verfügbare Händler: ${source.merchants}, Potenziell benötigt: ${merchantsNeededForPayload}`);

                merchantsNeededForPayload = 0; // Setze zurück, um die Händler für die *reduzierten* Mengen neu zu berechnen
                for (const resType of resourceTypes) {
                    let reducedAmount = Math.floor(potentialSendAmounts[resType] * reductionFactor);
                    reducedAmount = Math.floor(reducedAmount / 1000) * 1000; // Runde auf das nächste Tausender-Vielfaches ab
                    payload[resType] = reducedAmount;
                    merchantsNeededForPayload += Math.ceil(payload[resType] / 1000);
                }
                // Nach der Reduktion, falls durch Rundung immer noch zu viele Händler benötigt werden,
                // oder wenn der Faktor 0 war und keine Händler übrig sind (was zu 0 führen sollte),
                // stelle sicher, dass keine Lieferung stattfindet.
                if (merchantsNeededForPayload > source.merchants || (merchantsNeededForPayload === 0 && (payload.wood > 0 || payload.stone > 0 || payload.iron > 0))) {
                     logDebug(`Nach Reduktion kann Dorf ${source.name} keine sinnvollen Mengen senden oder es wären zu viele Händler nötig. Überspringe.`);
                     payload = { wood: 0, stone: 0, iron: 0 }; // Setze alles auf 0
                     merchantsNeededForPayload = 0;
                     continue; // Gehe zum nächsten Dorf
                 }
            } else if (merchantsNeededForPayload === 0 && (potentialSendAmounts.wood === 0 && potentialSendAmounts.stone === 0 && potentialSendAmounts.iron === 0)) {
                // Wenn von diesem Dorf generell nichts gesendet werden kann (kein Bedarf oder keine verfügbaren Ressourcen)
                logDebug(`Dorf ${source.name} hat keinen Bedarf für seine Ressourcen oder kann nichts liefern. Überspringe.`);
                continue;
            } else {
                // Händler reichen aus, nutze die direkt berechneten potenziellen Mengen
                payload = { ...potentialSendAmounts };
            }

            // 3. Phase: Senden (simuliert oder tatsächlich)
            // Nur fortfahren, wenn tatsächlich etwas gesendet werden soll
            if (payload.wood > 0 || payload.stone > 0 || payload.iron > 0) {
                // Speichere die aktuellen Ressourcen und Händler des Quelldorfes VOR der simulierten Abzug,
                // um sie in der Log-Meldung anzuzeigen.
                const initialSourceWood = source.wood;
                const initialSourceStone = source.stone;
                const initialSourceIron = source.iron;
                const initialSourceMerchants = source.merchants;

                // Aktualisiere den lokalen Zustand des Quelldorfes FÜR DIE NÄCHTEN SCHRITTE IN DIESER ANFORDERUNG
                // Dies stellt sicher, dass nachfolgende Dörfer im selben Zyklus die korrigierten Zahlen sehen.
                source.wood -= payload.wood;
                source.stone -= payload.stone;
                source.iron -= payload.iron;
                source.merchants -= merchantsNeededForPayload;

                // Speichere die Updates für das globale 'sources'-Array, das später aktualisiert wird
                sourcesToUpdate[source.id] = {
                    wood: source.wood,
                    stone: source.stone,
                    iron: source.iron,
                    merchants: source.merchants
                };

                if (DEBUG_MODE) {
                    logDebug(
                        `(SIMULIERT): Ressourcenanforderung von Dorf ${source.name} (${source.x}|${source.y}) nach ${game_data.village.name} für Gebäude ${buildingNr}: ` +
                        `H:${payload.wood} L:${payload.stone} E:${payload.iron}. Benötigt Händler: ${merchantsNeededForPayload}. ` +
                        `Bestand vorher: H:${initialSourceWood} L:${initialSourceStone} E:${initialSourceIron}. ` +
                        `Bestand nachher: H:${source.wood} L:${source.stone} E:${source.iron}. ` +
                        `Händler vorher: ${initialSourceMerchants}. Händler nachher: ${source.merchants}.`
                    );
                    UI.InfoMessage(`(SIMULIERT) Ressourcen von ${source.name} angefordert: H:${payload.wood} L:${payload.stone} E:${payload.iron}`, 3000);

                    // Im DEBUG-Modus: aktuelle simulierte eingehende Transporte aktualisieren
                    actualIncomingWood += payload.wood;
                    actualIncomingStone += payload.stone;
                    actualIncomingIron += payload.iron;

                    // currentTheoretical... muss hier auch neu berechnet werden, basierend auf dem aktuellen game_data und den simulierten eingehenden
                    currentTheoreticalWood = game_data.village.wood + actualIncomingWood;
                    currentTheoreticalStone = game_data.village.stone + actualIncomingStone;
                    currentTheoreticalIron = game_data.village.iron + actualIncomingIron;


                    logDebug(`Nach SIMULIERTER Lieferung von ${source.name}: Theoretische Ressourcen jetzt: H:${currentTheoreticalWood}, L:${currentTheoreticalStone}, E:${currentTheoreticalIron}`);
                    logDebug(`Nach SIMULIERTER Lieferung von ${source.name}: Eingehende Transporte (simuliert) jetzt: H:${actualIncomingWood}, L:${actualIncomingStone}, E:${actualIncomingIron}`);
                    // Hier zusätzlich die echten Werte loggen, die zuletzt vom Server kamen
                    logDebug(`Nach SIMULIERTER Lieferung von ${source.name}: Echte eingehende Transporte vom Server (zuletzt abgerufen): H:${lastActualIncomingWood}, L:${lastActualIncomingStone}, E:${lastActualIncomingIron}.`);


                    // Aktualisiere den *verbleibenden Bedarf* basierend auf den aktuellen theoretischen Ressourcen
                    currentNeeded.wood = Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood);
                    currentNeeded.stone = Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone);
                    currentNeeded.iron = Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron);

                } else { // PRODUKTIV MODUS
                    try {
                        const response = await TribalWars.post("market", {
                            "ajaxaction" : "map_send",
                            "village" : source.id
                        }, {
                            "target_id" : game_data.village.id,
                            "wood" : payload.wood,
                            "stone" : payload.stone,
                            "iron" : payload.iron,
                        });

                        const isSuccess = response && (response.success === true || (typeof response.message === 'string' && response.message.includes('Rohstoffe erfolgreich verschickt')));

                        if (isSuccess) {
                            let transferredWood = response.resources ? (response.resources.wood || 0) : payload.wood;
                            let transferredStone = response.resources ? (response.resources.stone || 0) : payload.stone;
                            let transferredIron = response.resources ? (response.resources.iron || 0) : payload.iron;

                            if (transferredWood > 0 || transferredStone > 0 || transferredIron > 0) {
                                UI.SuccessMessage(`Ressourcen von ${source.name} gesendet: H:${transferredWood} L:${transferredStone} E:${transferredIron}`, 3000);
                                console.log(`Ressourcen erfolgreich gesendet von ${source.name}. Übertragen: H:${transferredWood} L:${transferredStone} E:${transferredIron}. Antwort:`, response);

                                totalSentPotential.wood += transferredWood;
                                totalSentPotential.stone += transferredStone;
                                totalSentPotential.iron += transferredIron;

                                // source (lokale Kopie) wurde bereits oben aktualisiert
                                // sourcesToUpdate (globale Referenz) wurde bereits oben gesetzt

                                // *** WICHTIGE NEUE LOGIK FÜR PRODUKTIV-MODUS ***
                                // Nach jeder erfolgreichen Sendung die eingehenden Transporte vom Server neu abrufen.
                                // Dies stellt sicher, dass der Gesamtbedarf des Zieldorfes immer aktuell ist.
                                logDebug("PRODUKTIV-Modus: Erfolgreich gesendet. Aktualisiere eingehende Transporte vom Server.");
                                await initializeCurrentResources(true); // `true` um die Info-Nachricht zu unterdrücken
                                // Aktualisiere den *verbleibenden Bedarf* basierend auf den JETZT AKTUELLEN theoretischen Ressourcen
                                currentNeeded.wood = Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood);
                                currentNeeded.stone = Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone);
                                currentNeeded.iron = Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron);

                            } else {
                                logDebug(`Server antwortete mit Erfolg, aber 0 Ressourcen gesendet von ${source.name}. Wahrscheinlich wurde der Bedarf im letzten Moment gedeckt oder zu wenig verfügbar.`);
                            }

                        } else {
                            let errorMessage = response ? (response.message || 'Unbekannter Fehler') : 'Serverantwort war leer oder ungültig.';
                            UI.ErrorMessage(`Fehler beim Senden von Ressourcen von ${source.name}: ${errorMessage}`, 5000);
                            logError(`Fehler beim Senden von Ressourcen von ${source.name}. Antwort:`, response);
                        }
                    } catch (jqXHR) {
                        UI.ErrorMessage(`Netzwerkfehler oder unerwartete Antwort beim Senden von ${source.name}`, 5000);
                        logError(`Netzwerkfehler oder unerwartete Antwort beim Senden von ${source.name}. jqXHR/Error:`, jqXHR);
                    }
                }
                // --- VERZÖGERUNG HINZUFÜGEN (auch im Debug-Modus sinnvoll für realistische Simulation) ---
                await new Promise(resolve => setTimeout(resolve, 300)); // 300 Millisekunden Pause zwischen Sendungen
            }
        }

        // HINWEIS: Die finalen totalSentPotential Werte werden hier zur Anzeige verwendet,
        // aber currentTheoreticalWood/Stone/Iron wurden bereits fortlaufend aktualisiert.
        // Der Gesamtbedarf wird hier am Ende für die Zusammenfassung und die Button-Aktualisierung genutzt.
        // Die Logik für `finalRemaining...` ist jetzt korrekt, da sie auf den bereits aktualisierten
        // `currentTheoretical...` Werten basiert.


        // Anzeigen einer Zusammenfassung nach allen Versuchen
        let summaryMessage = `Anforderungsprozess für Gebäude ${buildingNr} abgeschlossen` + (DEBUG_MODE ? ' (SIMULIERT)' : '') + `.\n\n`;
        let anyResourceSent = totalSentPotential.wood > 0 || totalSentPotential.stone > 0 || totalSentPotential.iron > 0;

        const finalRemainingWood = Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood);
        const finalRemainingStone = Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone);
        const finalRemainingIron = Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron);

        if (anyResourceSent) {
            summaryMessage += `Gesendet in diesem Zyklus` + (DEBUG_MODE ? ' (simuliert)' : '') + `:\nHolz: ${totalSentPotential.wood}\nLehm: ${totalSentPotential.stone}\nEisen: ${totalSentPotential.iron}\n\n`;
        }

        if (finalRemainingWood > 0 || finalRemainingStone > 0 || finalRemainingIron > 0) {
            summaryMessage += "Es konnten nicht alle Ressourcen zugewiesen werden. Gründe können fehlende Händler, zu hohe Mindestbestände oder unzureichende Quelldörfer sein.\n\n";
            summaryMessage += `Verbleibender Gesamtbedarf für dieses Gebäude:\nHolz: ${finalRemainingWood}\nLehm: ${finalRemainingStone}\nEisen: ${finalRemainingIron}\n`;
            UI.ErrorMessage(summaryMessage, 8000); // Längere Anzeige für ungedeckten Bedarf
            logWarn("Unvollständige Ressourcendeckung für Gebäude" + (DEBUG_MODE ? ' (SIMULIERT)' : '') + ":", summaryMessage);
        } else {
            summaryMessage += `Alle benötigten Ressourcen für dieses Gebäude gedeckt` + (DEBUG_MODE ? ' (SIMULIERT)' : '') + `!`;
            UI.SuccessMessage(summaryMessage, 5000); // Standard-Anzeige für Erfolg
            logDebug("Alle Ressourcen für Gebäude gedeckt" + (DEBUG_MODE ? ' (SIMULIERT)' : '') + ".");
            $(`td[id='request${buildingNr}']`).remove(); // Button entfernen
        }
        logDebug("Ressourcenanforderung Zusammenfassung" + (DEBUG_MODE ? ' (SIMULIERT)' : '') + ":", summaryMessage);

        // Aktualisiere das ursprüngliche 'sources'-Array global für nachfolgende Anforderungen
        for (const sourceId in sourcesToUpdate) {
            const originalSource = sources.find(s => s.id == sourceId);
            if (originalSource) {
                originalSource.wood = sourcesToUpdate[sourceId].wood;
                originalSource.stone = sourcesToUpdate[sourceId].stone;
                originalSource.iron = sourcesToUpdate[sourceId].iron;
                originalSource.merchants = sourcesToUpdate[sourceId].merchants;
                logDebug(`Quelldorf ${originalSource.name} (ID: ${sourceId}) global aktualisiert` + (DEBUG_MODE ? ' (SIMULIERT)' : '') + `. Neue Werte: H:${originalSource.wood}, L:${originalSource.stone}, E:${originalSource.iron}, Händler: ${originalSource.merchants}`);
            }
        }

        // Prüfe die Gebäude erneut, um die Buttons basierend auf den neuen (theoretischen) Ressourcenständen zu aktualisieren
        checkBuildings();
    }; // END window.requestRes

    /**
     * Berechnet die Distanz zwischen zwei Dörfern.
     */
    function checkDistance(x1, y1, x2, y2) {
        var a = x1 - x2;
        var b = y1 - y2;
        return Math.round(Math.hypot(a, b));
    }

    /**
     * Lädt alle Dörfer der aktuell ausgewählten Dorfgruppe
     * und speichert deren Daten (Ressourcen, Händler etc.) im globalen 'sources'-Array.
     * @param {function} callback - Eine Funktion, die nach dem Laden der Quellen ausgeführt wird.
     */
    function showSourceSelect(callback) {
        logDebug(`Lade Quelldörfer für Gruppe ID: ${scriptSettings.selectedGroupId}`);
        sources = []; // Aktuelle Quellen leeren
        // group-parameter basiert nun auf der ausgewählten Gruppe
        $.get(`/game.php?&screen=overview_villages&mode=prod&group=${scriptSettings.selectedGroupId}&page=-1&`, function (resourcePage) {
            var $rowsResPage = $(resourcePage).find("#production_table tr").not(":first");
            if ($rowsResPage.length === 0) {
                logWarn("Keine Dörfer in der ausgewählten Gruppe oder keine Produktionstabelle gefunden.");
                UI.ErrorMessage("Keine Quelldörfer in der ausgewählten Gruppe gefunden.", 3000);
            }

            $rowsResPage.each(function() {
                var $row = $(this);
                var tempVillageID = $row.find('span[data-id]').attr("data-id");

                // Aktuelles Dorf von den potenziellen Quellen ausschließen
                if (tempVillageID != game_data.village.id) {
                    var coordsMatch = $row.find("span.quickedit-vn").text().trim().match(/(\d+)\|(\d+)/);
                    if (coordsMatch) { // Prüfe ob Koordinaten gefunden wurden
                        var tempX = parseInt(coordsMatch[1]);
                        var tempY = parseInt(coordsMatch[2]);
                        var tempDistance = checkDistance(tempX, tempY, parseInt(game_data.village.x), parseInt(game_data.village.y));
                        var tempWood = parseInt($row.find(".wood").text().replace(/\./g, ""));
                        var tempStone = parseInt($row.find(".stone").text().replace(/\./g, ""));
                        var tempIron = parseInt($row.find(".iron").text().replace(/\./g, ""));
                        var tempVillageName = $row.find('.quickedit-label').text().trim();
                        var merchantsMatch = $row.children().eq(5).text().trim().match(/(\d+)\//);
                        var tempMerchants = merchantsMatch ? parseInt(merchantsMatch[1]) : 0; // Fallback auf 0, falls keine Händler gefunden

                        sources.push({
                            "name": tempVillageName,
                            "id": tempVillageID,
                            "x": tempX, "y": tempY, "distance": tempDistance,
                            "wood": tempWood, "stone": tempStone, "iron": tempIron,
                            "merchants": tempMerchants
                        });
                    } else {
                        logWarn(`Koordinaten für Dorf-ID ${tempVillageID} nicht gefunden.`);
                    }
                }
            });
            // Quelldörfer nach Entfernung sortieren (nächstes zuerst)
            sources.sort(function (left, right) { return left.distance - right.distance; });
            logDebug("Quelldörfer geladen und sortiert:", sources);
        })
        .done(function () {
            if (callback && typeof callback === 'function') {
                logDebug("Callback nach showSourceSelect wird ausgeführt.");
                callback();
            }
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            UI.ErrorMessage("Fehler beim Laden der Dorfübersicht. Konnte keine Quell-Dörfer für die ausgewählte Gruppe ermitteln.", 5000);
            logError("Fehler beim Laden der Dorfübersicht:", textStatus, errorThrown, jqXHR);
        });
    }
})();
