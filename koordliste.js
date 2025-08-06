// ==UserScript==
// @name         Die Stämme - Manuelle Dorf-Koordinatenliste (Auto-Erfassung)
// @namespace    http://tampermonkey.net/
// @version      2.10.0
// @description  Erstellt eine manuell verwaltbare Liste von Dorfkoordinaten. Fügt Funktion hinzu, um Dörfer automatisch von Spielerübersichten auszulesen. Enthält Kopier- und Teilfunktion mit kollabierbaren Bereichen und Gesamtzahl der Koordinaten. Sucht Koordinaten flexibel in allen Spalten, EXKLUSIVE der ersten Spalte (Dorfname). Nur auf Spielerübersicht aktiv. Fügt Links zum Öffnen auf der Karte und zum Kopieren des BB-Codes hinzu. Fügt Entfernungsberechnung zu einem Referenzpunkt hinzu. Fügt Export- und Importfunktion der Liste hinzu.
// @author       Ihr Name / Generiert von Gemini
// @match        *://*.die-staemme.de/game.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = GM_info.script.version;
    const MANUAL_VILLAGES_STORAGE_KEY = 'ds_manual_village_list';
    const REFERENCE_COORD_STORAGE_KEY = 'ds_reference_coordinate';
    let uiCreated = false;

    // --- Robuste Speicherfunktionen mit Fallback auf localStorage ---
    function saveData(key, value) {
        try {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(key, value);
            } else {
                localStorage.setItem(key, value);
            }
        } catch (e) {
            console.error(`[Manuelle Dorfliste v${SCRIPT_VERSION}] FEHLER beim Speichern für ${key}:`, e);
        }
    }

    function loadData(key, defaultValue) {
        let value = defaultValue;
        try {
            if (typeof GM_getValue !== 'undefined') {
                value = GM_getValue(key, defaultValue);
            } else {
                const storedValue = localStorage.getItem(key);
                value = storedValue !== null ? storedValue : defaultValue;
            }
        } catch (e) {
            console.error(`[Manuelle Dorfliste v${SCRIPT_VERSION}] FEHLER beim Laden für ${key}:`, e);
        }
        return value;
    }
    // --- Ende der Speicherfunktionen ---

    // parseCoordinates Funktion: Erkennt XXX|XXX, XXX/XXX, XXX:XXX, XXX XXX und optionalen dritten Block
    function parseCoordinates(text) {
        if (!text) return [];
        const uniqueCoords = new Set();
        // Erlaubt | / : oder Leerzeichen als Trenner, erlaubt optional einen dritten Zahlenblock
        const coordRegex = /(\d{3})[|\/:\s](\d{3})(?:[|\/:\s]\d+)?/g;

        let match;
        while ((match = coordRegex.exec(text)) !== null) {
            const standardizedCoord = `${match[1]}|${match[2]}`; // Immer XXX|XXX Format speichern
            uniqueCoords.add(standardizedCoord);
        }
        return Array.from(uniqueCoords);
    }

    // Funktion zur Berechnung der Entfernung zwischen zwei Koordinaten
    function calculateDistance(coord1, coord2) {
        const [x1, y1] = coord1.split('|').map(Number);
        const [x2, y2] = coord2.split('|').map(Number);
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getStoredVillages() {
        const stored = loadData(MANUAL_VILLAGES_STORAGE_KEY, '[]');
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error(`[Manuelle Dorfliste v${SCRIPT_VERSION}] Fehler beim Parsen der gespeicherten Dörfer:`, e);
            return [];
        }
    }

    function saveVillages(villages) {
        saveData(MANUAL_VILLAGES_STORAGE_KEY, JSON.stringify(villages));
    }

    // Funktion zum Laden der Referenzkoordinate
    function getReferenceCoordinate() {
        return loadData(REFERENCE_COORD_STORAGE_KEY, '');
    }

    // Funktion zum Speichern der Referenzkoordinate
    function saveReferenceCoordinate(coord) {
        saveData(REFERENCE_COORD_STORAGE_KEY, coord);
    }

    function renderVillageTable() {
        const villages = getStoredVillages();
        const tableBody = document.getElementById('manualVillageTableBody');
        const villageCountSpan = document.getElementById('villageCount');
        const referenceCoordInput = document.getElementById('referenceCoordInput');
        const exportTextArea = document.getElementById('manualVillageExportOutput'); // Für Export-Sektion

        // Lade die gespeicherte Referenzkoordinate und zeige sie im Input an
        const referenceCoord = getReferenceCoordinate();
        if (referenceCoordInput) {
            referenceCoordInput.value = referenceCoord;
        }

        // Aktualisiere das Export-Textfeld
        if (exportTextArea) {
            exportTextArea.value = villages.join('\n');
        }

        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (villages.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Noch keine Dörfer hinzugefügt.</td></tr>';
        } else {
            villages.forEach((village, index) => {
                const row = tableBody.insertRow();
                row.insertCell(0).textContent = village; // Koordinate

                // Entfernungszelle
                const distanceCell = row.insertCell(1);
                if (referenceCoord && parseCoordinates(referenceCoord).length > 0) {
                    const distance = calculateDistance(village, referenceCoord).toFixed(2);
                    distanceCell.textContent = distance;
                    distanceCell.style.textAlign = 'center';
                } else {
                    distanceCell.textContent = '-';
                    distanceCell.style.textAlign = 'center';
                }

                // Aktionen Zelle
                const actionsCell = row.insertCell(2);
                actionsCell.style.textAlign = 'center';
                actionsCell.style.whiteSpace = 'nowrap';

                // Map Link Button
                const mapLinkButton = document.createElement('a');
                mapLinkButton.href = `game.php?screen=map&x=${village.split('|')[0]}&y=${village.split('|')[1]}`;
                mapLinkButton.target = '_blank';
                mapLinkButton.textContent = 'Karte';
                mapLinkButton.className = 'btn';
                mapLinkButton.style.padding = '2px 5px';
                mapLinkButton.style.fontSize = '0.8em';
                mapLinkButton.style.marginRight = '5px';
                actionsCell.appendChild(mapLinkButton);

                // BB-Code Kopieren Button
                const bbCodeCopyButton = document.createElement('a');
                bbCodeCopyButton.href = '#';
                bbCodeCopyButton.textContent = 'BB-Code';
                bbCodeCopyButton.className = 'btn';
                bbCodeCopyButton.style.padding = '2px 5px';
                bbCodeCopyButton.style.fontSize = '0.8em';
                bbCodeCopyButton.onclick = function(event) {
                    event.preventDefault();
                    const bbCode = `[coord]${village}[/coord]`;
                    navigator.clipboard.writeText(bbCode).then(() => {
                        alert(`BB-Code '${bbCode}' kopiert!`);
                    }).catch(err => {
                        console.error(`[Manuelle Dorfliste v${SCRIPT_VERSION}] Fehler beim Kopieren des BB-Codes:`, err);
                        alert('Fehler beim Kopieren des BB-Codes. Bitte manuell kopieren: ' + bbCode);
                    });
                };
                actionsCell.appendChild(bbCodeCopyButton);

                // Löschen Button
                const deleteCell = row.insertCell(3);
                const deleteButton = document.createElement('a');
                deleteButton.href = '#';
                deleteButton.textContent = 'Löschen';
                deleteButton.className = 'btn';
                deleteButton.style.padding = '2px 5px';
                deleteButton.style.fontSize = '0.8em';
                deleteButton.onclick = function(event) {
                    event.preventDefault();
                    deleteVillage(index);
                };
                deleteCell.appendChild(deleteButton);
                deleteCell.style.textAlign = 'center';
            });
        }

        if (villageCountSpan) {
            villageCountSpan.textContent = `(${villages.length} Dörfer)`;
        }
        displayVillagesForCopying();
    }

    function addVillages() {
        const input = document.getElementById('manualVillageInput');
        if (!input) return;

        const rawInput = input.value;
        const newCoords = parseCoordinates(rawInput);

        if (newCoords.length === 0) {
            alert('Bitte gültige Koordinaten eingeben (z.B. 500|500). Es werden gängige Formate wie XXX|XXX, XXX/XXX, XXX XXX oder XXX:XXX erkannt.');
            return;
        }

        let currentVillages = getStoredVillages();
        let addedCount = 0;

        newCoords.forEach(coord => {
            if (!currentVillages.includes(coord)) {
                currentVillages.push(coord);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            saveVillages(currentVillages.sort());
            renderVillageTable();
            input.value = '';
            alert(`${addedCount} neue Dörfer zur Liste hinzugefügt.`);
        } else {
            alert('Alle eingegebenen Dörfer sind bereits in der Liste.');
        }
    }

    // Funktion für Import
    function importVillages() {
        const importTextArea = document.getElementById('manualVillageImportInput');
        if (!importTextArea) return;

        const rawInput = importTextArea.value;
        const importedCoords = parseCoordinates(rawInput);

        if (importedCoords.length === 0) {
            alert('Keine gültigen Koordinaten zum Importieren gefunden.');
            return;
        }

        if (!confirm(`Sollen ${importedCoords.length} Dörfer importiert werden? Bestehende doppelte Dörfer werden ignoriert.`)) {
            return;
        }

        let currentVillages = getStoredVillages();
        let addedCount = 0;

        importedCoords.forEach(coord => {
            if (!currentVillages.includes(coord)) {
                currentVillages.push(coord);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            saveVillages(currentVillages.sort());
            renderVillageTable();
            importTextArea.value = '';
            alert(`${addedCount} neue Dörfer importiert. Insgesamt ${currentVillages.length} einzigartige Dörfer.`);
        } else {
            alert('Alle importierten Dörfer sind bereits in der Liste oder es wurden keine neuen gefunden.');
        }
    }


    function deleteVillage(indexToDelete) {
        if (!confirm('Soll dieses Dorf wirklich gelöscht werden?')) {
            return;
        }
        let currentVillages = getStoredVillages();
        if (indexToDelete > -1 && indexToDelete < currentVillages.length) {
            currentVillages.splice(indexToDelete, 1);
            saveVillages(currentVillages);
            renderVillageTable();
            alert('Dorf erfolgreich gelöscht.');
        }
    }


    function clearAllVillages() {
        if (confirm('Möchtest du WIRKLICH alle manuell hinzugefügten Dörfer löschen?')) {
            saveVillages([]);
            renderVillageTable();
            alert('Alle manuell hinzugefügten Dörfer wurden geleert.');
        }
    }

    // --- FUNKTION: Dörfer automatisch von der Seite erfassen (Durchsucht ALLE Spalten außer der ersten) ---
    function capturePageVillagesToManualList(pageType) {
        alert(`Manuelle Dorf-Erfassung (v${SCRIPT_VERSION}) wird gestartet.`);
        console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] Dorf-Erfassung für ${pageType}-Übersicht gestartet.`);
        let currentVillages = getStoredVillages();
        let uniqueData = new Set(currentVillages);
        let newlyAddedCount = 0;

        const infoTable = document.querySelector('#villages_list');
        if (!infoTable) {
            alert(`FEHLER: Konnte die Dorf-Tabelle ('#villages_list') auf der ${pageType}-Übersicht NICHT finden.`);
            console.error(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] FEHLER: Konnte die Dorf-Tabelle ('#villages_list') auf der ${pageType}-Übersicht NICHT finden.`);
            return;
        }

        const rows = infoTable.querySelectorAll('tbody > tr');
        console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] ${rows.length} Zeilen (Dörfer) in der Tabelle gefunden.`);

        if (rows.length === 0) {
            alert(`FEHLER: Keine Zeilen (tbody > tr) in der Tabelle auf ${pageType}-Übersicht gefunden.`);
            console.error(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] FEHLER: Keine Zeilen (tbody > tr) in der Tabelle auf ${pageType}-Übersicht gefunden.`);
            return;
        }

        rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('td');
            let coordFoundInRow = false;

            // Beginne die Suche ab Index 1, um die erste Spalte (Dorfname) zu überspringen.
            // Die erste Spalte ist normalerweise der Dorfname, der keine echten Koordinaten enthalten sollte.
            for (let i = 1; i < cells.length; i++) {
                const cell = cells[i];
                const cellTextContent = cell.textContent.trim();

                if (cellTextContent !== '') {
                    const coordsInCell = parseCoordinates(cellTextContent);

                    if (coordsInCell.length > 0) {
                        const standardizedCoord = `${coordsInCell[0]}`;

                        if (!uniqueData.has(standardizedCoord)) {
                            uniqueData.add(standardizedCoord);
                            newlyAddedCount++;
                            console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] Zeile ${rowIndex + 1}, Zelle Index ${i}: Koordinate '${standardizedCoord}' gefunden und hinzugefügt.`);
                        } else {
                            console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] Zeile ${rowIndex + 1}, Zelle Index ${i}: Koordinate '${standardizedCoord}' bereits vorhanden.`);
                        }
                        coordFoundInRow = true;
                        break; // Eine Koordinate pro Zeile reicht, zum nächsten Dorf gehen
                    }
                }
            }
            if (!coordFoundInRow) {
                console.warn(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] Zeile ${rowIndex + 1}: Keine Koordinate in dieser Zeile in den relevanten Spalten gefunden.`);
            }
        });

        saveVillages(Array.from(uniqueData).sort());
        renderVillageTable();

        if (newlyAddedCount > 0) {
            alert(`${newlyAddedCount} neue Dörfer von der ${pageType}-Übersicht zur manuellen Liste hinzugefügt. Insgesamt ${uniqueData.size} einzigartige Dörfer.`);
            console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] ERFOLG: ${newlyAddedCount} neue Dörfer von der ${pageType}-Übersicht zur manuellen Liste hinzugefügt. Insgesamt ${uniqueData.size} einzigartige Dörfer.`);
        } else {
            alert(`KEINE neuen Dörfer von der ${pageType}-Übersicht gefunden. Es wurden bereits alle erfasst oder es gab keine neuen zu finden.`);
            console.log(`[DS-ManuelleDörfer v${SCRIPT_VERSION}] INFO: KEINE neuen Dörfer von der ${pageType}-Übersicht gefunden. Es wurden bereits alle erfasst oder es gab keine neuen zu finden.`);
        }
    }


    function addCaptureButtonsToInfoPage(pageType) {
        const contentValue = document.getElementById('content_value');
        if (contentValue) {
            let buttonContainer = contentValue.querySelector('h2');
            if (buttonContainer && !buttonContainer.querySelector('.planner-buttons-container')) {
                const divButtons = document.createElement('div');
                divButtons.className = 'planner-buttons-container';
                divButtons.style.display = 'flex';
                divButtons.style.flexDirection = 'column';
                divButtons.style.alignItems = 'flex-start';
                divButtons.style.marginTop = '10px';

                const captureButton = document.createElement('a');
                captureButton.href = '#';
                captureButton.textContent = `Dörfer dieser ${pageType}-Übersicht zur manuellen Liste hinzufügen`;
                captureButton.className = 'btn';
                captureButton.onclick = function(event) {
                    event.preventDefault();
                    capturePageVillagesToManualList(pageType);
                };
                divButtons.appendChild(captureButton);

                buttonContainer.parentNode.insertBefore(divButtons, buttonContainer.nextSibling);
            }
        }
    }

    function displayVillagesForCopying() {
        const villages = getStoredVillages();
        const copyTextArea = document.getElementById('manualVillageCopyOutput');
        const exportTextArea = document.getElementById('manualVillageExportOutput'); // Auch hier aktualisieren
        if (copyTextArea) {
            copyTextArea.value = villages.join('\n');
        }
        if (exportTextArea) {
            exportTextArea.value = villages.join('\n');
        }
    }

    function splitVillageList() {
        const numPartsInput = document.getElementById('splitPartsInput');
        const outputDiv = document.getElementById('splitOutput');
        outputDiv.innerHTML = '';

        const numParts = parseInt(numPartsInput.value, 10);

        if (isNaN(numParts) || numParts <= 0) {
            alert('Bitte gib eine gültige positive Zahl für die Anzahl der Teile ein.');
            return;
        }

        const villages = getStoredVillages();
        if (villages.length === 0) {
            outputDiv.innerHTML = '<p>Die Liste ist leer. Es gibt nichts zu teilen.</p>';
            return;
        }

        if (numParts > villages.length) {
            alert('Die Anzahl der Teile kann nicht größer sein als die Anzahl der Dörfer.');
            return;
        }

        const baseSize = Math.floor(villages.length / numParts);
        let remainder = villages.length % numParts;
        let currentIndex = 0;

        for (let i = 0; i < numParts; i++) {
            let partSize = baseSize;
            if (remainder > 0) {
                partSize++;
                remainder--;
            }

            const part = villages.slice(currentIndex, currentIndex + partSize);
            currentIndex += partSize;

            const partHeader = document.createElement('h4');
            partHeader.textContent = `Teil ${i + 1} (${part.length} Dörfer):`;
            partHeader.style.marginTop = '10px';
            partHeader.style.marginBottom = '5px';
            outputDiv.appendChild(partHeader);

            const partTextArea = document.createElement('textarea');
            partTextArea.value = part.join('\n');
            partTextArea.rows = Math.min(part.length, 10);
            partTextArea.style.width = '100%';
            partTextArea.style.height = 'auto';
            partTextArea.readOnly = true;
            partTextArea.onclick = function() { this.select(); document.execCommand('copy'); alert('Liste kopiert!'); };
            outputDiv.appendChild(partTextArea);
        }
    }

    function toggleCollapse(headerElement) {
        const content = headerElement.nextElementSibling;
        const arrow = headerElement.querySelector('.collapse-arrow');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            arrow.style.transform = 'rotate(90deg)';
        } else {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(0deg)';
        }
    }


    function addManualVillageUI() {
        if (uiCreated) return;

        const contentValue = document.getElementById('content_value');
        if (contentValue) {
            const manualVillageDiv = document.createElement('div');
            manualVillageDiv.id = 'manualVillageUI';
            manualVillageDiv.style.border = '1px solid #ccc';
            manualVillageDiv.style.padding = '10px';
            manualVillageDiv.style.margin = '15px 0';
            manualVillageDiv.style.backgroundColor = '#f9f6e8';
            manualVillageDiv.style.borderRadius = '5px';

            const style = document.createElement('style');
            style.innerHTML = `
                .collapse-header {
                    cursor: pointer;
                    background-color: #e2d7c5;
                    padding: 8px;
                    border-bottom: 1px solid #d4c5b3;
                    margin: 0 -10px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .collapse-header:first-of-type {
                    border-top-left-radius: 4px;
                    border-top-right-radius: 4px;
                }
                .collapse-header:not(:first-of-type) {
                    margin-top: 10px;
                }
                .collapse-header h3, .collapse-header h4 {
                    margin: 0;
                    font-size: 1.1em;
                }
                .collapse-arrow {
                    transition: transform 0.2s ease-in-out;
                    font-weight: bold;
                    margin-right: 5px;
                }
                .collapse-content {
                    padding: 10px 0;
                    border-left: 1px solid #d4c5b3;
                    border-right: 1px solid #d4c5b3;
                    border-bottom: 1px solid #d4c5b3;
                    margin: 0 -10px;
                    border-bottom-left-radius: 4px;
                    border-bottom-right-radius: 4px;
                }
                .collapse-content.hidden {
                    display: none;
                }
                .manual-village-table-header th {
                    text-align: center;
                    padding: 5px;
                }
            `;
            document.head.appendChild(style);


            const addVillageSection = document.createElement('div');
            addVillageSection.innerHTML = `
                <div class="collapse-header" id="addVillagesHeader">
                    <h3>Dörfer hinzufügen <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="addVillagesContent">
                    <div style="margin-bottom: 10px;">
                        <label for="manualVillageInput">Koordinaten hinzufügen (z.B. 500|500):</label><br>
                        <textarea id="manualVillageInput" rows="3" style="width: 100%;"></textarea>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="addManualVillageBtn" class="btn">Dorf(Dörfer) hinzufügen</button>
                        <button id="clearManualVillagesBtn" class="btn" style="background-color: #f44336; color: white;">Alle Dörfer löschen</button>
                    </div>
                </div>
            `;
            manualVillageDiv.appendChild(addVillageSection);

            const copyVillagesSection = document.createElement('div');
            copyVillagesSection.innerHTML = `
                <div class="collapse-header" id="copyVillagesHeader">
                    <h3>Gespeicherte Dörfer (zum Kopieren) <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="copyVillagesContent">
                    <textarea id="manualVillageCopyOutput" rows="5" style="width: 100%;" readonly></textarea>
                    <p style="font-size: 0.9em; color: #666;">Klicke auf das Textfeld, um alle Dörfer zu kopieren.</p>
                </div>
            `;
            manualVillageDiv.appendChild(copyVillagesSection);

            const distanceCalcSection = document.createElement('div');
            distanceCalcSection.innerHTML = `
                <div class="collapse-header" id="distanceCalcHeader">
                    <h3>Entfernungsberechnung <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="distanceCalcContent">
                    <label for="referenceCoordInput">Referenzkoordinate (z.B. 500|500):</label><br>
                    <input type="text" id="referenceCoordInput" style="width: 100%; margin-bottom: 5px;" placeholder="Hier deine Koordinate eingeben">
                    <button id="setReferenceCoordBtn" class="btn">Referenzkoordinate setzen/aktualisieren</button>
                    <p style="font-size: 0.9em; color: #666; margin-top: 5px;">Nach dem Setzen wird die Tabelle aktualisiert.</p>
                </div>
            `;
            manualVillageDiv.appendChild(distanceCalcSection);

            // Neue Sektion für Export/Import
            const exportImportSection = document.createElement('div');
            exportImportSection.innerHTML = `
                <div class="collapse-header" id="exportImportHeader">
                    <h3>Liste exportieren / importieren <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="exportImportContent">
                    <h4 style="margin-top: 0;">Liste exportieren:</h4>
                    <textarea id="manualVillageExportOutput" rows="5" style="width: 100%;" readonly></textarea>
                    <p style="font-size: 0.9em; color: #666;">Kopiere den Text, um die Liste zu sichern oder zu teilen.</p>

                    <h4 style="margin-top: 15px;">Liste importieren:</h4>
                    <textarea id="manualVillageImportInput" rows="5" style="width: 100%;"></textarea>
                    <button id="importManualVillageBtn" class="btn" style="margin-top: 5px;">Liste importieren</button>
                    <p style="font-size: 0.9em; color: #666; margin-top: 5px;">Füge hier eine exportierte Liste ein und klicke "Importieren".</p>
                </div>
            `;
            manualVillageDiv.appendChild(exportImportSection);


            const manageVillagesSection = document.createElement('div');
            manageVillagesSection.innerHTML = `
                <div class="collapse-header" id="manageVillagesHeader">
                    <h3>Gespeicherte Dörfer (Verwaltung) <span id="villageCount"></span> <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="manageVillagesContent">
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #eee; background-color: #fff;">
                        <table class="vis" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr class="manual-village-table-header">
                                    <th style="width: 35%;">Koordinate</th>
                                    <th style="width: 15%;">Entfernung</th>
                                    <th style="width: 30%;">Aktionen</th>
                                    <th style="width: 20%;">Löschen</th>
                                </tr>
                            </thead>
                            <tbody id="manualVillageTableBody">
                                </tbody>
                        </table>
                    </div>
                </div>
            `;
            manualVillageDiv.appendChild(manageVillagesSection);

            const splitVillagesSection = document.createElement('div');
            splitVillagesSection.innerHTML = `
                <div class="collapse-header" id="splitVillagesHeader">
                    <h3>Dörfer aufteilen <span class="collapse-arrow">></span></h3>
                </div>
                <div class="collapse-content hidden" id="splitVillagesContent">
                    <label for="splitPartsInput">Anzahl der Teile:</label>
                    <input type="number" id="splitPartsInput" value="2" min="1" style="width: 60px; margin-left: 5px;">
                    <button id="splitListBtn" class="btn" style="margin-left: 10px;">Liste aufteilen</button>
                    <div id="splitOutput" style="margin-top: 10px; border: 1px solid #eee; background-color: #fff; padding: 10px;">
                        </div>
                </div>
            `;
            manualVillageDiv.appendChild(splitVillagesSection);


            const mainContent = document.getElementById('content_value');
            if (mainContent) {
                const overviewTable = mainContent.querySelector('table.vis');
                if (overviewTable) {
                    overviewTable.parentNode.insertBefore(manualVillageDiv, overviewTable.nextSibling);
                } else {
                    mainContent.appendChild(manualVillageDiv);
                }
            }

            // Event Listener hinzufügen
            document.getElementById('addManualVillageBtn').onclick = addVillages;
            document.getElementById('clearManualVillagesBtn').onclick = clearAllVillages;
            document.getElementById('splitListBtn').onclick = splitVillageList;
            document.getElementById('manualVillageCopyOutput').onclick = function() {
                this.select();
                document.execCommand('copy');
                alert('Alle Dörfer kopiert!');
            };
            document.getElementById('setReferenceCoordBtn').onclick = function() {
                const input = document.getElementById('referenceCoordInput');
                const parsed = parseCoordinates(input.value);
                if (parsed.length > 0) {
                    saveReferenceCoordinate(parsed[0]);
                    renderVillageTable();
                    alert(`Referenzkoordinate auf '${parsed[0]}' gesetzt.`);
                } else {
                    alert('Ungültige Referenzkoordinate. Bitte im Format XXX|XXX eingeben.');
                    saveReferenceCoordinate('');
                    renderVillageTable();
                }
            };
            document.getElementById('importManualVillageBtn').onclick = importVillages; // Neuer Import-Button Listener

            // Collapse Header Listener
            document.getElementById('addVillagesHeader').onclick = function() { toggleCollapse(this); };
            document.getElementById('copyVillagesHeader').onclick = function() { toggleCollapse(this); };
            document.getElementById('distanceCalcHeader').onclick = function() { toggleCollapse(this); };
            document.getElementById('exportImportHeader').onclick = function() { toggleCollapse(this); }; // Neuer Header
            document.getElementById('manageVillagesHeader').onclick = function() { toggleCollapse(this); };
            document.getElementById('splitVillagesHeader').onclick = function() { toggleCollapse(this); };


            renderVillageTable();
            uiCreated = true;
        }
    }

    function onDomReady() {
        const currentURL = window.location.href;

        if (currentURL.includes('screen=info_player')) {
            addManualVillageUI();
            addCaptureButtonsToInfoPage('Spieler');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }

})();
