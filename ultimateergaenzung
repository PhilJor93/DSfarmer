// ==UserScript==
// @name         Die Stämme: Ultimateplan-Import in Gruppenübersicht
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Erweitert das "Koordinaten hinzufügen"-Popup, um Koordinaten aus einem DS Ultimateplan zu extrahieren und einzufügen. Die Erweiterung wird oben im Popup platziert und extrahiert Herkunftsdörfer dynamisch aus der "Herkunft"-Spalte.
// @author       Dein Name (optional)
// @match        https://*.die-staemme.de/game.php?village=*&screen=overview_villages&mode=groups
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = "2.1";

    // *** START-MELDUNG DES SKRIPTS ***
    console.log(`[DS Ultimateplan Script] Skript gestartet. Version: ${SCRIPT_VERSION}`);

    // Funktion zum Extrahieren der Herkunftsdörfer aus dem Ultimateplan-Text
    function extractOriginVillages(planText) {
        const origins = [];
        let originColumnIndex = -1;

        // 1. Finde die Header-Zeile, um die Position der "Herkunft"-Spalte zu bestimmen
        const headerMatch = planText.match(/\[\*\*\](.*?)\[\/\*\*\]/);
        if (headerMatch && headerMatch[1]) {
            const headers = headerMatch[1].split('[||]');
            originColumnIndex = headers.findIndex(header => header.trim() === 'Herkunft');
        }

        if (originColumnIndex === -1) {
            console.warn("[DS Ultimateplan Script] Spalte 'Herkunft' im Plan nicht gefunden. Kann keine Dörfer extrahieren.");
            return ""; // Leeren String zurückgeben, wenn die Spalte nicht gefunden wurde
        }

        // 2. Extrahiere die Koordinaten basierend auf der gefundenen Spaltenposition
        // Regex, um jede Zeile der Tabelle zu finden
        const rowRegex = /\[\*\](.*?)\[\/\*\]/g;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(planText)) !== null) {
            const rowContent = rowMatch[1]; // Inhalt der aktuellen Zeile
            const columns = rowContent.split('[|]'); // Spalten der Zeile splitten

            if (columns.length > originColumnIndex) {
                const originColumnContent = columns[originColumnIndex];
                // Regex, um die Koordinate innerhalb des Spalteninhalts zu finden
                const coordMatch = originColumnContent.match(/\[coord\](\d{3}\|\d{3})\[\/coord\]/);
                if (coordMatch && coordMatch[1]) {
                    origins.push(coordMatch[1]);
                }
            }
        }
        return origins.join(' ');
    }

    function extendAddCoordinatesPopup() {
        const popupBox = document.getElementById('popup_box_add_coordinates_dialog');

        if (popupBox && popupBox.classList.contains('show')) {
            const popupTitle = popupBox.querySelector('.popup_box_header');

            if (popupTitle && popupTitle.textContent.trim() === 'Koordinaten hinzufügen') {
                const formElement = popupBox.querySelector('form');
                const originalTextarea = formElement ? formElement.querySelector('textarea[name="coordinates_list"]') : null;

                if (formElement && originalTextarea) {
                    if (formElement.querySelector('#ds-ultimateplan-section')) {
                        return; // Elemente sind schon da, nichts tun
                    }

                    // *** DEBUG-MELDUNG: Popup gefunden ***
                    console.log(`[DS Ultimateplan Script] "Koordinaten hinzufügen" Popup gefunden und wird erweitert.`);

                    // --- Skript-Versionsanzeige (oben platziert) ---
                    const myInfoDiv = document.createElement('div');
                    myInfoDiv.id = 'ds-script-version-info';
                    myInfoDiv.style.marginBottom = '20px';
                    myInfoDiv.style.paddingBottom = '10px';
                    myInfoDiv.style.borderBottom = '1px dashed #ccc';
                    myInfoDiv.style.textAlign = 'center';
                    myInfoDiv.style.color = '#804000';
                    myInfoDiv.style.fontSize = '0.9em';

                    myInfoDiv.innerHTML = `<p>Skript Version: <b>${SCRIPT_VERSION}</b></p>`;
                    formElement.prepend(myInfoDiv);


                    // --- Sektion für den Ultimateplan-Import (direkt unter der Version) ---
                    const ultimatePlanSection = document.createElement('div');
                    ultimatePlanSection.id = 'ds-ultimateplan-section';
                    ultimatePlanSection.style.marginTop = '20px';
                    ultimatePlanSection.style.paddingBottom = '10px';
                    ultimatePlanSection.style.borderBottom = '1px dashed #ccc';
                    ultimatePlanSection.style.color = '#804000';

                    ultimatePlanSection.innerHTML = `
                        <h4 style="margin-top: 0; margin-bottom: 10px; text-align: center; color: #804000;">DS Ultimateplan Import</h4>
                        <p style="margin-bottom: 5px;">Füge hier deinen Ultimateplan ein, um Herkunftsdörfer zu extrahieren:</p>
                        <textarea id="ds-ultimateplan-textarea" rows="8" style="width: 98%; resize: vertical; box-sizing: border-box;"></textarea>
                        <button type="button" id="ds-parse-plan-btn" class="btn" style="margin-top: 10px;">Herkunftsdörfer extrahieren</button>
                    `;

                    formElement.prepend(ultimatePlanSection);

                    const parseButton = document.getElementById('ds-parse-plan-btn');
                    const ultimatePlanTextarea = document.getElementById('ds-ultimateplan-textarea');

                    if (parseButton && ultimatePlanTextarea) {
                        parseButton.addEventListener('click', () => {
                            const planText = ultimatePlanTextarea.value;
                            const extractedOrigins = extractOriginVillages(planText);

                            if (extractedOrigins.length > 0) {
                                if (originalTextarea.value.trim() !== "") {
                                    originalTextarea.value += " " + extractedOrigins;
                                } else {
                                    originalTextarea.value = extractedOrigins;
                                }
                                ultimatePlanTextarea.value = '';
                                console.log(`[DS Ultimateplan Script] ${extractedOrigins.split(' ').length} Herkunftsdörfer erfolgreich extrahiert und eingefügt.`);
                            } else {
                                alert("Keine Herkunftsdörfer im Ultimateplan gefunden. Stelle sicher, dass die Tabelle eine Spalte 'Herkunft' enthält und gültige Koordinaten im Format '[coord]XXX|YYY[/coord]'.");
                                console.warn("[DS Ultimateplan Script] Keine Herkunftsdörfer gefunden oder Spalte 'Herkunft' nicht identifizierbar.");
                            }
                        });
                    }

                    observer.disconnect();
                }
            }
        }
    }

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.id === 'popup_box_add_coordinates_dialog') {
                        setTimeout(extendAddCoordinatesPopup, 50);
                        return;
                    }
                    if (node.nodeType === Node.ELEMENT_NODE && node.querySelector('#popup_box_add_coordinates_dialog')) {
                         setTimeout(extendAddCoordinatesPopup, 50);
                         return;
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
