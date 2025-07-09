// ==UserScript==
// @name         Tribal Wars Smart Resource Request (Anfrage Helfer) - DEBUG MODE (Produktiv - V.1.1.17)
// @namespace    http://tampermonkey.net/
// @version      1.1.17 // Version erhöht für verbesserte Erfolgsprüfung bei HTML-Antwort
// @description  Ein Skript für Tribal Wars, das intelligent Ressourcen für Gebäude anfordert, mit Optionen für Dorfgruppen, maximale Mengen pro Dorf und Mindestbestände. (Zeigt NUR finalen Alert und sendet Ressourcen!)
// @author       DeinName (Anpassbar)
// @match        https://*.tribalwars.*/game.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '1.1.17'; // HIER WIRD DIE VERSION GEFÜHRT

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
        maxSendWood: 0,       // Standard: Keine Begrenzung
        maxSendStone: 0,
        maxSendIron: 0,
        minWood: 10000,       // Mindestmenge Holz im Quelldorf
        minStone: 10000,      // Mindestmenge Lehm im Quelldorf
        minIron: 10000        // Mindestmenge Eisen im Quelldorf
    };
    const STORAGE_KEY = 'hgholen_smart_request_settings';

    // --- Einstellungen speichern/laden ---
    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(scriptSettings));
            UI.InfoMessage('Einstellungen gespeichert.', 2000);
        } catch (e) {
            console.error("Fehler beim Speichern der Einstellungen:", e);
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
                scriptSettings.maxSendIron = parseInt(parsed.maxSendIron) || 0;
                // Neue Mindestmengen-Einstellungen mit Fallback auf 10000, falls nicht vorhanden oder ungültig
                scriptSettings.minWood = (parsed.minWood !== undefined && !isNaN(parseInt(parsed.minWood))) ? parseInt(parsed.minWood) : 10000;
                scriptSettings.minStone = (parsed.minStone !== undefined && !isNaN(parseInt(parsed.minStone))) ? parseInt(parsed.minStone) : 10000;
                scriptSettings.minIron = (parsed.minIron !== undefined && !isNaN(parseInt(parsed.minIron))) ? parseInt(parsed.minIron) : 10000;
                return true;
            } catch (e) {
                console.error("Fehler beim Laden der Einstellungen:", e);
                UI.ErrorMessage('Fehler beim Laden der Einstellungen. Standardwerte geladen.', 3000);
                return false;
            }
        }
        return false;
    }

    // --- Hilfsfunktion zum Abrufen der Dorfgruppen-Optionen ---
    function getGroupOptionsHtml(selectedId) {
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
                } else {
                    console.warn("Keine Dorfgruppen aus dem API-Aufruf erhalten oder unerwartetes Format.", data);
                }
                resolve(html);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Fehler beim Laden der Dorfgruppen:", textStatus, errorThrown, jqXHR);
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
                    <p><small>Hinweis: Eine Limit von 0 (Null) bei "Max. XYZ pro Dorf" bedeutet keine Begrenzung.<br>
                    Eine Mindestmenge von 0 (Null) bei "Mindest-XYZ im Quelldorf" bedeutet, dass das Quelldorf bis auf 0 entleert werden kann.</small></p>
                </div>
            `;

            Dialog.show("Ressourcen-Anforderung Einstellungen", dialogContent);

            // Event Listener für den Speichern-Button
            $('#saveSettingsBtn').on('click', function() {
                scriptSettings.selectedGroupId = $('#resourceGroupSelect').val();
                scriptSettings.maxSendWood = parseInt($('#maxWoodInput').val()) || 0;
                scriptSettings.maxSendStone = parseInt($('#maxStoneInput').val()) || 0;
                scriptSettings.maxSendIron = parseInt($('#maxIronInput').val()) || 0;
                // Min-Werte, wenn leer, sollen nicht zu NaN werden, sondern 0 oder der definierte Standard.
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
        // Sicherstellen, dass das Skript auf der Hauptgebäude-Seite ausgeführt wird
        if (window.location.href.indexOf('&screen=main') < 0) {
            window.location.assign(game_data.link_base_pure + "main");
            return; // Beende das Skript hier, um doppelte Ausführung nach Weiterleitung zu vermeiden
        }

        currentTheoreticalWood = game_data.village.wood;
        currentTheoreticalStone = game_data.village.stone;
        currentTheoreticalIron = game_data.village.iron;
        WHCap = game_data.village.storage_max;

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
            } else {
                $buttonCell.append(`<td id="request${i}"><input type="button" class="btn btn-disabled" value="Lager zu klein"></td>`);
            }
        });
    }

    /**
     * Fordert Ressourcen für ein bestimmtes Gebäude intelligent aus der Dorfgruppe an.
     * Berücksichtigt Einstellungen für maximale Mengen pro Dorf, Mindestbestände und Lagerkapazität.
     * Gibt Informationen per Alert aus und sendet Ressourcen.
     * @param {number} buildingNr - Der Index des Gebäudes im resourcesNeeded-Array.
     */
    window.requestRes = function(buildingNr) { // window. zur globalen Verfügbarkeit
        let needed = {
            wood: Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood),
            stone: Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone),
            iron: Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron)
        };

        if (needed.wood <= 0 && needed.stone <= 0 && needed.iron <= 0) {
            alert('Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!');
            UI.InfoMessage('Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!', 2000);
            $(`td[id='request${buildingNr}']`).remove(); // Button entfernen, wenn Ressourcen gedeckt
            return;
        }

        // Prüfung auf Lagerplatz im Zieldorf (einschließlich bereits angeforderter Ressourcen)
        if (currentTheoreticalWood + needed.wood > WHCap || currentTheoreticalStone + needed.stone > WHCap || currentTheoreticalIron + needed.iron > WHCap) {
            alert("Nicht genug Lagerplatz im Ziel-Dorf für diese Menge an Ressourcen (bereits angeforderte Ressourcen berücksichtigt)!");
            UI.ErrorMessage("Nicht genug Lagerplatz im Ziel-Dorf für diese Menge an Ressourcen (bereits angeforderte Ressourcen berücksichtigt)!", 4000);
            return;
        }

        let promises = [];
        let totalSentPotential = { wood: 0, stone: 0, iron: 0 }; // Verfolgt, was TATSÄCHLICH gesendet wird
        let sourcesToUpdate = {}; // Verfolgt die neuen Ressourcenstände der Quelldörfer
        let remainingNeeded = { ...needed }; // Kopie des Bedarfs

        // Erstelle eine tiefe Kopie der Quelldörfer, um sie lokal für diese Anforderung zu manipulieren,
        // ohne nachfolgende Anfragen für andere Gebäude in dieser Skriptsitzung zu beeinflussen.
        let availableSources = JSON.parse(JSON.stringify(sources));

        availableSources.forEach(source => {
            if (remainingNeeded.wood <= 0 && remainingNeeded.stone <= 0 && remainingNeeded.iron <= 0) {
                return false; // Beendet die each-Schleife, da Bedarf gedeckt wäre
            }

            let sendFromSource = { wood: 0, stone: 0, iron: 0 };
            let currentTransferLoad = 0;

            // --- Holz ---
            let availableToSendWood = source.wood - scriptSettings.minWood;
            if (availableToSendWood < 0) availableToSendWood = 0; // Kann nicht unter das Minimum senden
            if (remainingNeeded.wood > 0 && availableToSendWood > 0) {
                let amount = Math.min(remainingNeeded.wood, availableToSendWood);
                if (scriptSettings.maxSendWood > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendWood);
                }
                sendFromSource.wood = amount;
                currentTransferLoad += amount;
                remainingNeeded.wood -= amount;
            }

            // --- Lehm ---
            let availableToSendStone = source.stone - scriptSettings.minStone;
            if (availableToSendStone < 0) availableToSendStone = 0;
            if (remainingNeeded.stone > 0 && availableToSendStone > 0) {
                let amount = Math.min(remainingNeeded.stone, availableToSendStone);
                if (scriptSettings.maxSendStone > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendStone);
                }
                sendFromSource.stone = amount;
                currentTransferLoad += amount;
                remainingNeeded.stone -= amount;
            }

            // --- Eisen ---
            let availableToSendIron = source.iron - scriptSettings.minIron;
            if (availableToSendIron < 0) availableToSendIron = 0;
            if (remainingNeeded.iron > 0 && availableToSendIron > 0) {
                let amount = Math.min(remainingNeeded.iron, availableToSendIron);
                if (scriptSettings.maxSendIron > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendIron);
                }
                sendFromSource.iron = amount;
                currentTransferLoad += amount;
                remainingNeeded.iron -= amount;
            }
            
            let merchantsNeededForThisTransfer = Math.ceil(currentTransferLoad / 1000);

            if ((sendFromSource.wood > 0 || sendFromSource.stone > 0 || sendFromSource.iron > 0) && merchantsNeededForThisTransfer <= source.merchants) {
                promises.push(new Promise((resolve, reject) => {
                    // Schritt 1: Initialisiere den Handel, um das Bestätigungsformular zu erhalten
                    TribalWars.post('market', {
                        ajax: 'send',              // Die Aktion zum Senden
                        village: source.id,        // Die ID des sendenden Dorfes
                        h: game_data.csrf          // Der Sicherheits-Hash
                    }, {
                        'target_village': game_data.village.id, // Die ID des Ziel-Dorfes
                        'wood': sendFromSource.wood,
                        'stone': sendFromSource.stone,
                        'iron': sendFromSource.iron,
                        'max_merchants': merchantsNeededForThisTransfer,
                        'send': '1'                // Bestätigungsflag für den ersten Schritt
                    }, function (response1) {
                        try {
                            if (response1.dialog) {
                                alert(`ERFOLG (Schritt 1: Bestätigungsdialog erhalten): Anfrage von ${source.name}. Server-Antwort (JSON): ${JSON.stringify(response1)}`);
                                console.log("Schritt 1 erfolgreich, Bestätigungsdialog erhalten:", response1);

                                // HTML-Dialog parsen und Formulardaten extrahieren
                                // Wickle den HTML-Code in ein temporäres div, um sicherzustellen, dass .find() korrekt funktioniert
                                const $dialogContent = $('<div>').html(response1.dialog);
                                const $form = $dialogContent.find('form[name="market"]');

                                if ($form.length === 0) { // Überprüfe, ob das Formular tatsächlich gefunden wurde
                                    alert(`FEHLER (Schritt 1 Parsing): Formular mit Namen "market" im Dialog nicht gefunden für ${source.name}.`);
                                    reject();
                                    return;
                                }

                                const formAction = $form.attr('action');

                                if (!formAction) {
                                    alert(`FEHLER (Schritt 1 Parsing): Formular-Action im Dialog nicht gefunden für ${source.name}.`);
                                    reject();
                                    return;
                                }

                                const postData = {};
                                $form.find('input[type="hidden"]').each(function() {
                                    postData[$(this).attr('name')] = $(this).val();
                                });

                                // Die im Formular vorgeschlagenen Mengen sind möglicherweise nicht die, die wir senden wollten.
                                // Wir überschreiben sie hier mit unseren ursprünglich berechneten Werten.
                                postData['wood'] = sendFromSource.wood;
                                postData['stone'] = sendFromSource.stone;
                                postData['iron'] = sendFromSource.iron;
                                
                                // Der "Absenden"-Button im Bestätigungsformular hat oft den Namen "confirm" oder "submit"
                                // Wir müssen sicherstellen, dass dieser Parameter gesendet wird.
                                postData['confirm'] = '1'; // Standardname für den Bestätigungsbutton

                                // Überprüfen ob der Hash bereits in den POST-Daten ist, ansonsten hinzufügen
                                if (!postData['h']) {
                                    const hashMatch = formAction.match(/h=([a-f0-9]+)/); // Dies findet 'h' nicht, wenn es nur in den versteckten Feldern ist
                                    if (hashMatch) {
                                        postData['h'] = hashMatch[1];
                                    } else {
                                        postData['h'] = game_data.csrf; // Fallback auf den globalen CSRF-Token
                                    }
                                }
                                
                                // --- Start Korrektur: Direkter $.post() Aufruf für Schritt 2 ---
                                const fullPostUrl = window.location.origin + formAction;

                                $.post(fullPostUrl, postData)
                                    .done(function(response2) {
                                        console.log(`Raw Server-Antwort (Schritt 2 - $.post):`, response2);
                                        let successDetected = false;
                                        let successMessage = '';
                                        let errorMessage = '';

                                        if (typeof response2 === 'string') {
                                            const $responseHtml = $('<div>').html(response2);
                                            const responseTitle = $responseHtml.find('title').text();
                                            
                                            // **Verbesserte Erfolgsprüfung für HTML-Antworten:**
                                            // Prüfen, ob der Titel der Antwortseite den Namen und die Koordinaten des Quelldorfs enthält.
                                            // Dies ist ein starker Indikator für einen erfolgreichen Transfer und eine Weiterleitung zur Dorf-Übersichtsseite.
                                            if (responseTitle.includes(source.name) && responseTitle.includes(`${source.x}|${source.y}`)) {
                                                successDetected = true;
                                                successMessage = 'Ressourcen erfolgreich verschickt (Server-Antwort ist die Dorf-Übersichtsseite des Quelldorfes).';
                                            }
                                            // Bestandsprüfung für alte Erfolgsmeldungen (falls sie doch vorkommen)
                                            else if (response2.includes('UI.SuccessMessage(') || response2.includes('Du hast deine Rohstoffe erfolgreich verschickt') || response2.includes('Rohstoffe versendet')) {
                                                successDetected = true;
                                                successMessage = 'Ressourcen erfolgreich verschickt (Textanalyse in HTML).';
                                            } else if (response2.includes('UI.ErrorMessage(') || response2.includes('Fehler')) {
                                                errorMessage = 'Server meldete einen Fehler im HTML (Textanalyse).';
                                            } else {
                                                errorMessage = 'Unklare Serverantwort (HTML).';
                                            }
                                        } else if (response2 && typeof response2 === 'object') {
                                            // Prüfung für JSON-Antworten (weniger wahrscheinlich für diesen Schritt)
                                            if (response2.success) {
                                                successDetected = true;
                                                successMessage = 'Ressourcen erfolgreich verschickt (JSON-Analyse).';
                                            } else if (response2.message) {
                                                errorMessage = `Server meldete Fehler (JSON): ${response2.message}`;
                                            } else {
                                                errorMessage = 'Unklare Serverantwort (JSON).';
                                            }
                                        } else {
                                            errorMessage = 'Unbekanntes Antwortformat.';
                                        }

                                        if (successDetected) {
                                            let transferredWood = sendFromSource.wood; // Da wir die genauen Werte gesendet haben, nehmen wir diese als gesendet an
                                            let transferredStone = sendFromSource.stone;
                                            let transferredIron = sendFromSource.iron;

                                            alert(`ENDGÜLTIGER ERFOLG (via $.post): Anfrage von ${source.name}. Gesendet: H:${transferredWood} L:${transferredStone} E:${transferredIron}. Details: ${successMessage}. Raw Response (verkürzt): ${JSON.stringify(response2).substring(0, 200)}...`);

                                            totalSentPotential.wood += transferredWood;
                                            totalSentPotential.stone += transferredStone;
                                            totalSentPotential.iron += transferredIron;

                                            sourcesToUpdate[source.id] = {
                                                wood: source.wood - transferredWood,
                                                stone: source.stone - transferredStone,
                                                iron: source.iron - transferredIron,
                                                merchants: source.merchants - merchantsNeededForThisTransfer
                                            };
                                            resolve();
                                        } else {
                                            alert(`FEHLER (Endgültiger Versand via $.post): Anfrage von ${source.name} fehlgeschlagen. Details: ${errorMessage}. Raw Response (verkürzt): ${JSON.stringify(response2).substring(0, 200)}...`);
                                            reject();
                                        }
                                    })
                                    .fail(function(jqXHR2, textStatus2, errorThrown2) {
                                        console.error(`Netzwerkfehler (Schritt 2 - $.post) während der Ressourcenanfrage von ${source.name}. Status:`, textStatus2, 'Fehler:', errorThrown2, 'jqXHR:', jqXHR2);
                                        alert(`FEHLER (Netzwerk Schritt 2 - $.post): Anfrage von ${source.name}. Status: ${textStatus2 || 'unbekannt'}, Fehler: ${errorThrown2 || 'unbekannt'}.`);
                                        reject();
                                    });
                                // --- Ende Korrektur: Direkter $.post() Aufruf ---

                            } else if (response1.success) { // Fallback, falls der erste Request direkt erfolgreich ist ohne Dialog (unwahrscheinlich für Market Send)
                                let transferredWood = response1.resources ? (response1.resources.wood || 0) : sendFromSource.wood;
                                let transferredStone = response1.resources ? (response1.resources.stone || 0) : sendFromSource.stone;
                                let transferredIron = response1.resources ? (response1.resources.iron || 0) : sendFromSource.iron;

                                console.log(`Ressourcenanfrage von ${source.name} erfolgreich (ohne Dialog?). Antwort:`, response1);
                                alert(`ERFOLG: Anfrage von ${source.name}. Gesendet: H:${transferredWood} L:${transferredStone} E:${transferredIron}. Server-Antwort (JSON): ${JSON.stringify(response1)}`);

                                totalSentPotential.wood += transferredWood;
                                totalSentPotential.stone += transferredStone;
                                totalSentPotential.iron += transferredIron;

                                sourcesToUpdate[source.id] = {
                                    wood: source.wood - transferredWood,
                                    stone: source.stone - transferredStone,
                                    iron: source.iron - transferredIron,
                                    merchants: source.merchants - merchantsNeededForThisTransfer
                                };
                                resolve();
                            } else {
                                console.error(`Ressourcenanfrage von ${source.name} fehlgeschlagen (Schritt 1 ohne Dialog). Antwort:`, response1);
                                alert(`FEHLER (Schritt 1 Backend): Anfrage von ${source.name} fehlgeschlagen. Nachricht: ${response1.message || 'Unbekannter Fehler'}. Server-Antwort (JSON): ${JSON.stringify(response1)}`);
                                reject();
                            }
                        } catch (e) {
                             alert(`FEHLER (Parsing Schritt 1 Antwort): Anfrage von ${source.name}. Konnte Server-Antwort nicht verarbeiten. Fehler: ${e.message}. Raw Response: ${JSON.stringify(response1)}`);
                             console.error("Fehler beim Parsen der Schritt 1 Server-Antwort:", e, response1);
                             reject();
                        }
                    }, function (jqXHR1, textStatus1, errorThrown1) {
                        console.error(`Netzwerkfehler (Schritt 1) während der Ressourcenanfrage von ${source.name}. Status:`, textStatus1, 'Fehler:', errorThrown1, 'jqXHR:', jqXHR1);
                        alert(`FEHLER (Netzwerk Schritt 1): Anfrage von ${source.name}. Status: ${textStatus1}, Fehler: ${errorThrown1}.`);
                        reject();
                    });
                }));
            } else if (sendFromSource.wood > 0 || sendFromSource.stone > 0 || sendFromSource.iron > 0) {
                // Wenn nichts gesendet werden konnte (z.B. nicht genug Händler), füge einen leeren Promise hinzu, damit allSettled nicht blockiert
                promises.push(Promise.resolve());
            }
        });

        // Warte auf alle (echten oder simulierten) Anfragen
        Promise.allSettled(promises).then(() => {
            // Nach Abschluss aller Anfragen: Aktualisiere die theoretischen Ressourcen des aktuellen Dorfes
            currentTheoreticalWood += totalSentPotential.wood;
            currentTheoreticalStone += totalSentPotential.stone;
            currentTheoreticalIron += totalSentPotential.iron;

            // Bereite die Debug-Ausgabe vor
            let debugOutput = `Ressourcen wurden angefordert (falls möglich).\n\n`;
            debugOutput += `Fehlende Ressourcen für Gebäude (vor Anfrage):\nHolz: ${needed.wood}\nLehm: ${needed.stone}\nEisen: ${needed.iron}\n\n`;
            debugOutput += `Ausgewählte Anforderungs-Gruppe (ID): ${scriptSettings.selectedGroupId}\n`;
            debugOutput += `Max. Sende-Mengen pro Quelldorf (0 = unbegrenzt):\nHolz: ${scriptSettings.maxSendWood}\nLehm: ${scriptSettings.maxSendStone}\nEisen: ${scriptSettings.maxSendIron}\n`;
            debugOutput += `Mindest-Verbleib im Quelldorf:\nHolz: ${scriptSettings.minWood}\nLehm: ${scriptSettings.minStone}\nEisen: ${scriptSettings.minIron}\n\n`;

            if (Object.keys(sourcesToUpdate).length === 0 && (needed.wood > 0 || needed.stone > 0 || needed.iron > 0)) {
                debugOutput += "Es konnten keine Ressourcen von den verfügbaren Quelldörfern zugewiesen werden (innerhalb der ausgewählten Gruppe und Einstellungen).\n\n";
            } else {
                debugOutput += `Ressourcen gesendet von folgenden Dörfern (Ist-Zustand nach dem Senden):\n\n`;
                for (const sourceId in sourcesToUpdate) {
                    const originalSource = sources.find(s => s.id == sourceId); // Finde Originaldaten
                    const updatedSource = sourcesToUpdate[sourceId]; // Finde die neuen, theoretischen Restdaten

                    debugOutput += `Dorf: ${originalSource.name} (${originalSource.id}) [Entf: ${originalSource.distance}]:\n`;
                    debugOutput += `  Gesendet: H: ${originalSource.wood - updatedSource.wood}, L: ${originalSource.stone - updatedSource.stone}, E: ${originalSource.iron - updatedSource.iron} (Benötigte Händler: ${originalSource.merchants - updatedSource.merchants})\n`;
    debugOutput += `  Verbleibend: H: ${updatedSource.wood}, L: ${updatedSource.stone}, E: ${updatedSource.iron} | Händler: ${updatedSource.merchants}\n\n`;
                }
            }

            debugOutput += `Gesamte Ressourcen, die in diesem Zyklus gesendet wurden:\n`;
            debugOutput += `Holz: ${totalSentPotential.wood}\n`;
            debugOutput += `Lehm: ${totalSentPotential.stone}\n`;
            debugOutput += `Eisen: ${totalSentPotential.iron}\n\n`;

            debugOutput += `Verbleibender Gesamtbedarf nach dieser Aktion:\n`;
            debugOutput += `Holz: ${Math.max(0, needed.wood - totalSentPotential.wood)}\n`;
            debugOutput += `Lehm: ${Math.max(0, needed.stone - totalSentPotential.stone)}\n`;
            debugOutput += `Eisen: ${Math.max(0, needed.iron - totalSentPotential.iron)}\n\n`;

            alert(debugOutput); // HIER IST DER FINALE ALERT

            // Aktualisiere das ursprüngliche 'sources'-Array global für nachfolgende Anforderungen
            for (const sourceId in sourcesToUpdate) {
                const originalSource = sources.find(s => s.id == sourceId);
                if (originalSource) {
                    originalSource.wood = sourcesToUpdate[sourceId].wood;
                    originalSource.stone = sourcesToUpdate[sourceId].stone;
                    originalSource.iron = sourcesToUpdate[sourceId].iron;
                    originalSource.merchants = sourcesToUpdate[sourceId].merchants;
                }
            }

            // Prüfe die Gebäude erneut, um die Buttons basierend auf den neuen (theoretischen) Ressourcenständen zu aktualisieren
            checkBuildings();
        });
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
        sources = []; // Aktuelle Quellen leeren
        // group-parameter basiert nun auf der ausgewählten Gruppe
        $.get(`/game.php?&screen=overview_villages&mode=prod&group=${scriptSettings.selectedGroupId}&page=-1&`, function (resourcePage) {
            var $rowsResPage = $(resourcePage).find("#production_table tr").not(":first");
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
                        var tempMerchants = parseInt(merchantsMatch[1]);

                        sources.push({
                            "name": tempVillageName,
                            "id": tempVillageID,
                            "x": tempX, "y": tempY, "distance": tempDistance,
                            "wood": tempWood, "stone": tempStone, "iron": tempIron,
                            "merchants": tempMerchants
                        });
                    } else {
                        console.warn(`Koordinaten für Dorf-ID ${tempVillageID} nicht gefunden.`);
                    }
                }
            });
            // Quelldörfer nach Entfernung sortieren (nächstes zuerst)
            sources.sort(function (left, right) { return left.distance - right.distance; });
        })
        .done(function () {
            if (callback && typeof callback === 'function') {
                callback();
            }
        })
        .fail(function() {
            UI.ErrorMessage("Fehler beim Laden der Dorfübersicht. Konnte keine Quell-Dörfer für die ausgewählte Gruppe ermitteln.", 5000);
        });
    }
})();
