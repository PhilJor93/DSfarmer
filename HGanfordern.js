// ==UserScript==
// @name          Tribal Wars Smart Resource Request (Anfrage Helfer) (V.1.8)
// @namespace     http://tampermonkey.net/
// @version       1.8 // Feature: Umschaltbarer Debug-Modus
// @description   Ein Skript für Tribal Wars, das intelligent Ressourcen für Gebäude anfordert, mit Optionen für Dorfgruppen, maximale Mengen pro Dorf und Mindestbestände. Mit umschaltbarem Debug-Modus.
// @author        PhilJor93 - Generiert mithilfe von Google Gemini KI
// @match         https://*.tribalwars.*/game.php*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // *** WICHTIG: DEBUG_MODE hier einstellen ***
    // Setze auf 'true' für Simulationsmodus (kein Versand), auf 'false' für echten Versand.
    const DEBUG_MODE = true; // Setze auf 'false' für PROD!
    // *****************************************

    const SCRIPT_VERSION = '1.8' + (DEBUG_MODE ? ' - DEBUG MODE' : ' - PRODUCTIVE MODE');

    // --- Globale Variablen für das Skript ---
    var sources = []; // Speichert alle potenziellen Quelldörfer und deren Daten
    var resourcesNeeded = []; // Speichert die Bedarfe der Gebäude im aktuellen Dorf

    // Diese Variablen verfolgen die theoretischen Ressourcen des aktuellen Dorfes,
    // einschließlich der bereits angeforderten, aber noch nicht angekommenen Ressourcen.
    var currentTheoreticalWood = 0;
    var currentTheoreticalStone = 0;
    var currentTheoreticalIron = 0;
    var WHCap = 0; // Maximale Lagerkapazität des aktuellen Dorfes

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
                scriptSettings.maxSendStone = parseInt(parsed.maxSendStone) || 0;
                scriptSettings.maxIron = parseInt(parsed.maxIron) || 0;
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
                            <td><input type="number" id="maxIronInput" value="${scriptSettings.maxIron}" min="0" class="input-nicer"></td>
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
                scriptSettings.maxIron = parseInt($('#maxIronInput').val()) || 0;
                scriptSettings.minWood = parseInt($('#minWoodInput').val()) || 0;
                scriptSettings.minStone = parseInt($('#minStoneInput').val()) || 0;
                scriptSettings.minIron = parseInt($('#minIronInput').val()) || 0;
                saveSettings();
                Dialog.close();
                // Quellen basierend auf neuer Gruppe neu laden und Gebäude prüfen
                showSourceSelect(function() {
                    checkBuildings();
                });
            });
        });
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

        currentTheoreticalWood = game_data.village.wood;
        currentTheoreticalStone = game_data.village.stone;
        currentTheoreticalIron = game_data.village.iron;
        WHCap = game_data.village.storage_max;
        logDebug(`Aktuelles Dorf: ${game_data.village.name} (ID: ${game_data.village.id})`);
        logDebug(`Aktuelle Ressourcen (Start): Holz: ${currentTheoreticalWood}, Lehm: ${currentTheoreticalStone}, Eisen: ${currentTheoreticalIron}. Lagerkapazität: ${WHCap}`);


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

        // Einstellungen laden oder Dialog öffnen, falls keine geladen werden konnten
        if (!loadSettings()) {
            openSettingsDialog();
        } else {
            // Quellen laden und Gebäude prüfen
            showSourceSelect(function() {
                checkBuildings();
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
        logDebug(`Anforderung für Gebäude ${buildingNr} gestartet.`);
        let initialNeeded = {
            wood: Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood),
            stone: Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone),
            iron: Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron)
        };
        // Aktueller Bedarf, der sich während des Sendens reduziert
        let currentNeeded = { ...initialNeeded };

        logDebug(`Benötigter Bedarf für Gebäude ${buildingNr} (inkl. theoretischer Ressourcen): H:${currentNeeded.wood}, L:${currentNeeded.stone}, E:${currentNeeded.iron}`);

        if (currentNeeded.wood <= 0 && currentNeeded.stone <= 0 && currentNeeded.iron <= 0) {
            UI.InfoMessage('Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!', 2000);
            $(`td[id='request${buildingNr}']`).remove(); // Button entfernen, wenn Ressourcen gedeckt
            logDebug("Bedarf bereits gedeckt. Beende Anforderung.");
            return;
        }

        // Prüfung auf Lagerplatz im Zieldorf (einschließlich bereits angeforderter Ressourcen)
        const totalNeededAfterCurrent = initialNeeded.wood + initialNeeded.stone + initialNeeded.iron;
        const currentTotalResources = currentTheoreticalWood + currentTheoreticalStone + currentTheoreticalIron;

        if (currentTotalResources + totalNeededAfterCurrent > WHCap * 3) { // Prüfe ob Gesamtlagerkapazität reicht (3fache Menge für alle res)
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

        // NEUE LOGIK: Iteriere durch die Quelldörfer und sende mehrere Rohstoffe gleichzeitig
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
            let merchantsNeededForSource = 0;
            const resourceTypes = ['wood', 'stone', 'iron'];
            let calculatedSendAmounts = {}; // Temporäre Speicherung der berechneten Mengen pro Ressource

            // 1. Phase: Berechne, wie viel von jeder Ressource gesendet werden KÖNNTE (ohne Händlerlimit)
            for (const resType of resourceTypes) {
                if (currentNeeded[resType] <= 0) {
                    calculatedSendAmounts[resType] = 0;
                    continue;
                }

                let sendAmountForRes = 0;
                let availableToSendFromSource = source[resType] - scriptSettings[`min${resType.charAt(0).toUpperCase() + resType.slice(1)}`];
                if (availableToSendFromSource < 0) availableToSendFromSource = 0;

                if (availableToSendFromSource > 0) {
                    sendAmountForRes = Math.min(currentNeeded[resType], availableToSendFromSource);

                    const maxSendSetting = scriptSettings[`maxSend${resType.charAt(0).toUpperCase() + resType.slice(1)}`];
                    if (maxSendSetting > 0) {
                        sendAmountForRes = Math.min(sendAmountForRes, maxSendSetting);
                    } else {
                        // Wenn maxSendSetting = 0, begrenzt durch den gesamten verbleibenden Bedarf
                        sendAmountForRes = Math.min(sendAmountForRes, currentNeeded[resType]);
                    }
                }
                calculatedSendAmounts[resType] = sendAmountForRes;
                merchantsNeededForSource += Math.ceil(sendAmountForRes / 1000);
            }

            // 2. Phase: Passe die Sendemengen an das Händlerlimit des Dorfes an
            if (merchantsNeededForSource > source.merchants && merchantsNeededForSource > 0) {
                let reductionFactor = source.merchants / merchantsNeededForSource;
                logDebug(`Dorf ${source.name} hat nicht genug Händler für alle gewünschten Ressourcen. Reduktionsfaktor: ${reductionFactor.toFixed(2)}. Verfügbare Händler: ${source.merchants}, Benötigt: ${merchantsNeededForSource}`);

                merchantsNeededForSource = 0; // Setze zurück, um neu zu berechnen
                for (const resType of resourceTypes) {
                    let reducedAmount = Math.floor(calculatedSendAmounts[resType] * reductionFactor);
                    // Sicherstellen, dass die Menge ein Vielfaches von 1000 ist (für Händler)
                    reducedAmount = Math.floor(reducedAmount / 1000) * 1000;
                    payload[resType] = reducedAmount;
                    merchantsNeededForSource += Math.ceil(payload[resType] / 1000);
                }
                // Nach der Reduktion, falls immer noch zu viele Händler benötigt werden (durch Rundung),
                // oder wenn der Faktor 0 war und keine Händler übrig sind, setze auf 0
                if (merchantsNeededForSource > source.merchants || source.merchants === 0) {
                    payload = { wood: 0, stone: 0, iron: 0 };
                    merchantsNeededForSource = 0;
                    logDebug(`Nach Reduktion konnte Dorf ${source.name} keine sinnvollen Mengen senden. Überspringe.`);
                    continue;
                }
            } else if (merchantsNeededForSource <= 0 && (calculatedSendAmounts.wood <=0 && calculatedSendAmounts.stone <=0 && calculatedSendAmounts.iron <=0)) {
                // Wenn keine Ressourcen benötigt werden oder keine Händler benötigt werden (z.B. alles 0)
                logDebug(`Dorf ${source.name} hat keinen Bedarf oder keine Händler nötig. Überspringe.`);
                continue;
            } else {
                // Händler reichen aus, nutze die berechneten Mengen
                for (const resType of resourceTypes) {
                    payload[resType] = calculatedSendAmounts[resType];
                }
            }


            // 3. Phase: Senden (simuliert oder tatsächlich)
            if (payload.wood > 0 || payload.stone > 0 || payload.iron > 0) {
                if (DEBUG_MODE) {
                    logDebug(`(SIMULIERT): Ressourcenanforderung von Dorf ${source.name} nach ${game_data.village.name} für Gebäude ${buildingNr}: H:${payload.wood} L:${payload.stone} E:${payload.iron}. Benötigt Händler: ${merchantsNeededForSource}.`);
                    UI.InfoMessage(`(SIMULIERT) Ressourcen von ${source.name} angefordert: H:${payload.wood} L:${payload.stone} E:${payload.iron}`, 3000);

                    // Im Debug-Modus simulieren wir den Erfolg und aktualisieren die Zustände
                    let transferredWood = payload.wood;
                    let transferredStone = payload.stone;
                    let transferredIron = payload.iron;

                    totalSentPotential.wood += transferredWood;
                    totalSentPotential.stone += transferredStone;
                    totalSentPotential.iron += transferredIron;

                    // Aktualisiere den aktuellen Bedarf basierend auf dem, was simuliert gesendet wurde
                    currentNeeded.wood = Math.max(0, currentNeeded.wood - transferredWood);
                    currentNeeded.stone = Math.max(0, currentNeeded.stone - transferredStone);
                    currentNeeded.iron = Math.max(0, currentNeeded.iron - transferredIron);

                    // Aktualisiere den lokalen Zustand des Quelldorfes für nachfolgende Iterationen in DIESER Anforderung
                    source.wood -= transferredWood;
                    source.stone -= transferredStone;
                    source.iron -= transferredIron;
                    source.merchants -= merchantsNeededForSource; // Reduziere Händler unabhängig von tatsächlicher Sendemenge, da sie unterwegs wären

                    // Speichere die Updates für das globale 'sources'-Array
                    sourcesToUpdate[source.id] = {
                        wood: source.wood,
                        stone: source.stone,
                        iron: source.iron,
                        merchants: source.merchants
                    };

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

                                currentNeeded.wood = Math.max(0, currentNeeded.wood - transferredWood);
                                currentNeeded.stone = Math.max(0, currentNeeded.stone - transferredStone);
                                currentNeeded.iron = Math.max(0, currentNeeded.iron - transferredIron);

                                source.wood -= transferredWood;
                                source.stone -= transferredStone;
                                source.iron -= transferredIron;
                                source.merchants -= merchantsNeededForSource;

                                sourcesToUpdate[source.id] = {
                                    wood: source.wood,
                                    stone: source.stone,
                                    iron: source.iron,
                                    merchants: source.merchants
                                };
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
                await new Promise(resolve => setTimeout(resolve, 300)); // 300 Millisekunden Pause
            }
        }

        // Nach Abschluss aller Anfragen: Aktualisiere die theoretischen Ressourcen des aktuellen Dorfes
        currentTheoreticalWood += totalSentPotential.wood;
        currentTheoreticalStone += totalSentPotential.stone;
        currentTheoreticalIron += totalSentPotential.iron;

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
