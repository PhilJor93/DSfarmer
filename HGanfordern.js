// ==UserScript==
// @name         Tribal Wars Smart Resource Request (Anfrage Helfer) - DEBUG MODE (Produktiv)
// @namespace    http://tampermonkey.net/
// @version      1.1.5 // Version erhöht, um echte Requests zu aktivieren
// @description  Ein Skript für Tribal Wars, das intelligent Ressourcen für Gebäude anfordert, mit Optionen für Dorfgruppen, maximale Mengen pro Dorf und Mindestbestände. (Zeigt Alerts UND sendet Ressourcen!)
// @author       DeinName (Anpassbar)
// @match        https://*.tribalwars.*/game.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
                scriptSettings.maxSendStone = parseInt(parsed.maxStone) || 0;
                scriptSettings.maxSendIron = parseInt(parsed.maxIron) || 0;
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
                    <h3>Einstellungen für Ressourcenanforderung</h3>
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
                // parseInt(value) || 0; lässt leere Eingaben zu 0 werden, was für Min-Werte sinnvoll sein kann.
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
            alert('DEBUG: Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!');
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
                    TribalWars.post('market', { ajaxaction: 'call', village: game_data.village.id }, {
                        "select-village": source.id,
                        "target_id": 0, // 0 für Zieldorf (aktuelles Dorf)
                        "wood": sendFromSource.wood,
                        "stone": sendFromSource.stone,
                        "iron": sendFromSource.iron,
                        "merchant_count": merchantsNeededForThisTransfer
                    }, function (response) {
                        if (response.success) {
                            UI.SuccessMessage(`Ressourcen von Dorf ${source.name} (${source.id}) angefordert.`, 2000);
                            // Nur aktualisieren, wenn der Versand erfolgreich war
                            totalSentPotential.wood += sendFromSource.wood;
                            totalSentPotential.stone += sendFromSource.stone;
                            totalSentPotential.iron += sendFromSource.iron;

                            sourcesToUpdate[source.id] = {
                                wood: source.wood - sendFromSource.wood,
                                stone: source.stone - sendFromSource.stone,
                                iron: source.iron - sendFromSource.iron,
                                merchants: source.merchants - merchantsNeededForThisTransfer
                            };
                            resolve();
                        } else {
                            UI.ErrorMessage(`Fehler bei Anforderung von ${source.name}: ${response.message || 'Unbekannter Fehler'}`, 4000);
                            reject();
                        }
                    },
                    function () { // Fehler-Callback für Netzwerkprobleme
                        UI.ErrorMessage(`Netzwerkfehler bei Anforderung von ${source.name}.`, 4000);
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

            alert(debugOutput); // HIER IST DER ALERT

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
        // group-Parameter basiert nun auf der ausgewählten Gruppe
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
