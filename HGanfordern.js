javascript: (function() {
    // --- Globale Variablen für das Skript ---
    var sources = []; // Speichert alle potenziellen Quelldörfer und deren Daten
    var resourcesNeeded = []; // Speichert die Bedarfe der Gebäude im aktuellen Dorf

    // Diese Variablen verfolgen die theoretischen Ressourcen des aktuellen Dorfes,
    // einschließlich der bereits angeforderten, aber noch nicht angekommenen Ressourcen.
    var currentTheoreticalWood = 0;
    var currentTheoreticalStone = 0;
    var currentTheoreticalIron = 0;
    var WHCap = 0; // Maximale Lagerkapazität des aktuellen Dorfes

    // --- NEU: Globale Einstellungen und Speicher-Schlüssel ---
    var scriptSettings = {
        selectedGroupId: '0', // Standard: 'Alle Dörfer'
        maxSendWood: 0,       // Standard: Keine Begrenzung
        maxSendStone: 0,
        maxSendIron: 0
    };
    const STORAGE_KEY = 'hgholen_smart_request_settings';

    // --- NEU: Einstellungen speichern/laden ---
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
                // Parsed-Werte sicher in scriptSettings übernehmen
                scriptSettings.selectedGroupId = parsed.selectedGroupId || '0';
                scriptSettings.maxSendWood = parseInt(parsed.maxSendWood) || 0;
                scriptSettings.maxSendStone = parseInt(parsed.maxSendStone) || 0;
                scriptSettings.maxSendIron = parseInt(parsed.maxSendIron) || 0;
                return true;
            } catch (e) {
                console.error("Fehler beim Laden der Einstellungen:", e);
                UI.ErrorMessage('Fehler beim Laden der Einstellungen. Standardwerte geladen.', 3000);
                return false;
            }
        }
        return false;
    }

    // --- NEU: Einstellungen-Dialog öffnen ---
    function openSettingsDialog() {
        let groupOptionsHtml = `<option value="0">Alle Dörfer</option>`;
        if (typeof game_data !== 'undefined' && game_data.groups) {
            for (const groupId in game_data.groups) {
                if (game_data.groups.hasOwnProperty(groupId)) {
                    const groupName = game_data.groups[groupId];
                    const selectedAttr = (groupId === scriptSettings.selectedGroupId) ? 'selected' : '';
                    groupOptionsHtml += `<option value="${groupId}" ${selectedAttr}>${groupName}</option>`;
                }
            }
        } else {
             console.warn("game_data.groups nicht verfügbar. Gruppenliste möglicherweise unvollständig.");
        }

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
                </table>
                <br>
                <div style="text-align: center;">
                    <input type="button" class="btn evt-confirm-btn btn-confirm-yes" id="saveSettingsBtn" value="Einstellungen speichern &amp; aktualisieren">
                </div>
                <p><small>Hinweis: Eine Limit von 0 (Null) bedeutet keine Begrenzung für diese Ressource pro Quelldorf.</small></p>
            </div>
        `;

        Dialog.show("Ressourcen-Anforderung Einstellungen", dialogContent);

        // Event Listener für den Speichern-Button
        $('#saveSettingsBtn').on('click', function() {
            scriptSettings.selectedGroupId = $('#resourceGroupSelect').val();
            scriptSettings.maxSendWood = parseInt($('#maxWoodInput').val()) || 0;
            scriptSettings.maxSendStone = parseInt($('#maxStoneInput').val()) || 0;
            scriptSettings.maxSendIron = parseInt($('#maxIronInput').val()) || 0;
            saveSettings();
            Dialog.close();
            // Quellen basierend auf neuer Gruppe neu laden und Gebäude prüfen
            showSourceSelect(function() {
                checkBuildings();
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
     * Berücksichtigt Einstellungen für maximale Mengen pro Dorf und Lagerkapazität.
     * @param {number} buildingNr - Der Index des Gebäudes im resourcesNeeded-Array.
     */
    function requestRes(buildingNr) {
        let needed = {
            wood: Math.max(0, resourcesNeeded[buildingNr].wood - currentTheoreticalWood),
            stone: Math.max(0, resourcesNeeded[buildingNr].stone - currentTheoreticalStone),
            iron: Math.max(0, resourcesNeeded[buildingNr].iron - currentTheoreticalIron)
        };

        if (needed.wood <= 0 && needed.stone <= 0 && needed.iron <= 0) {
            UI.InfoMessage('Alle benötigten Ressourcen bereits vorhanden (oder unterwegs)!', 2000);
            $(`input[id='request${buildingNr}']`).remove(); // Button entfernen, wenn Ressourcen gedeckt
            return;
        }

        // Prüfung auf Lagerplatz im Zieldorf (einschließlich bereits angeforderter Ressourcen)
        if (currentTheoreticalWood + needed.wood > WHCap || currentTheoreticalStone + needed.stone > WHCap || currentTheoreticalIron + needed.iron > WHCap) {
            UI.ErrorMessage("Nicht genug Lagerplatz im Ziel-Dorf für diese Menge an Ressourcen (bereits angeforderte Ressourcen berücksichtigt)!", 4000);
            return;
        }

        let promises = [];
        let totalSent = { wood: 0, stone: 0, iron: 0 };
        let sourcesToUpdate = {}; 

        // Erstelle eine tiefe Kopie der Quelldörfer, um sie lokal für diese Anforderung zu manipulieren,
        // ohne nachfolgende Anfragen für andere Gebäude in dieser Skriptsitzung zu beeinflussen.
        let availableSources = JSON.parse(JSON.stringify(sources));

        // Iteriere durch die verfügbaren Quelldörfer (bereits nach Entfernung sortiert)
        availableSources.forEach(source => {
            let sendFromSource = { wood: 0, stone: 0, iron: 0 };
            let currentTransferLoad = 0;

            // Fülle Holzbedarf auf, unter Berücksichtigung der Quell-Verfügbarkeit und des Bedarfs
            if (needed.wood > 0 && source.wood > 0) {
                let amount = Math.min(needed.wood, source.wood);
                // NEU: Berücksichtige die maximale Sende-Menge pro Dorf
                if (scriptSettings.maxSendWood > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendWood);
                }
                sendFromSource.wood = amount;
                currentTransferLoad += amount;
                needed.wood -= amount;
            }

            // Fülle Lehmbedarf auf
            if (needed.stone > 0 && source.stone > 0) {
                let amount = Math.min(needed.stone, source.stone);
                if (scriptSettings.maxSendStone > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendStone);
                }
                sendFromSource.stone = amount;
                currentTransferLoad += amount;
                needed.stone -= amount;
            }

            // Fülle Eisenbedarf auf
            if (needed.iron > 0 && source.iron > 0) {
                let amount = Math.min(needed.iron, source.iron);
                if (scriptSettings.maxSendIron > 0) {
                    amount = Math.min(amount, scriptSettings.maxSendIron);
                }
                sendFromSource.iron = amount;
                currentTransferLoad += amount;
                needed.iron -= amount;
            }
            
            // Berechne benötigte Händler für diesen spezifischen Transfer (1 Händler pro 1000 Kapazität)
            let merchantsNeededForThisTransfer = Math.ceil(currentTransferLoad / 1000);

            // Sende nur, wenn Ressourcen ausgewählt wurden und Händler verfügbar sind
            if ((sendFromSource.wood > 0 || sendFromSource.stone > 0 || sendFromSource.iron > 0) && merchantsNeededForThisTransfer <= source.merchants) {
                // Änderungen für die lokale Aktualisierung speichern (um das globale 'sources' Array zu aktualisieren)
                sourcesToUpdate[source.id] = {
                    wood: source.wood - sendFromSource.wood,
                    stone: source.stone - sendFromSource.stone,
                    iron: source.iron - sendFromSource.iron,
                    merchants: source.merchants - merchantsNeededForThisTransfer
                };

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
                            totalSent.wood += sendFromSource.wood;
                            totalSent.stone += sendFromSource.stone;
                            totalSent.iron += sendFromSource.iron;
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
                // Benötigte Ressourcen, aber Quelle kann nicht liefern oder nicht genug Händler
                UI.ErrorMessage(`Dorf ${source.name} (${source.id}) konnte nicht die benötigten Ressourcen bereitstellen (nicht genug oder keine Händler frei).`, 4000);
            }

            // Wenn alle benötigten Ressourcen erfüllt sind, Schleife beenden
            if (needed.wood <= 0 && needed.stone <= 0 && needed.iron <= 0) {
                return false; // Beendet die each-Schleife von jQuery
            }
        });

        // Wenn nach der Iteration keine Quellen die benötigten Ressourcen bereitstellen konnten
        if (promises.length === 0 && (needed.wood > 0 || needed.stone > 0 || needed.iron > 0)) {
            UI.ErrorMessage("Keine Quelldörfer gefunden, die die benötigten Ressourcen bereitstellen können oder die Voraussetzungen erfüllen.", 4000);
            return;
        }

        // Warte auf alle ausstehenden Anfragen
        Promise.allSettled(promises).then(() => {
            // Nach Abschluss aller Anfragen: Aktualisiere die theoretischen Ressourcen des aktuellen Dorfes
            currentTheoreticalWood += totalSent.wood;
            currentTheoreticalStone += totalSent.stone;
            currentTheoreticalIron += totalSent.iron;

            UI.SuccessMessage(`Gesamte Ressourcenanforderung abgeschlossen.`, 2000);
            
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
    }

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
