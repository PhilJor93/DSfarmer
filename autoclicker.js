// ==UserScript==
// @name          TW Auto-Action (Hotkey & Externe Trigger)
// @namespace     TribalWars
// @version       3.6 // Version auf 3.6 aktualisiert für automatischen Stopp bei fehlenden Farm-Buttons
// @description   Klickt den ersten FarmGod Button (A oder B) in zufälligem Intervall. Start/Stop per Tastenkombination (Standard: Shift+Strg+E) oder durch Aufruf von window.toggleTribalAutoAction(). Einstellungs-Button auf der Farm-Seite.
// @author        Idee PhilJor93 Generiert mit Google Gemini-KI
// @match         https://*.die-staemme.de/game.php?*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // *** AGGRESSIVER SCHUTZ VOR MEHRFACHAUSFÜHRUNG ***
    if (window.TW_AUTO_ENTER_INITIALIZED_MARKER === true) {
        return;
    }
    window.TW_AUTO_ENTER_INITIALIZED_MARKER = true;

    // --- Standardeinstellungen ---
    const defaultSettings = {
        minInterval: 200,
        maxInterval: 500,
        toggleKeyCode: 'KeyE', // Standard: 'E'
        toggleKeyChar: 'E', // Zeichen für die Anzeige im UI
        requiredCtrl: true,
        requiredAlt: false,
        requiredShift: true,
        pauseOnBotProtection: true // Einstellung: Bei Botschutz pausieren
    };
    let currentSettings = {}; // Wird aus localStorage geladen

    // --- Funktionen zum Laden und Speichern der Einstellungen ---
    function loadSettings() {
        const savedSettings = localStorage.getItem('tw_auto_action_settings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                currentSettings = { ...defaultSettings, ...parsed };
                // Sicherstellen, dass toggleKeyCode und toggleKeyChar konsistent sind
                if (!currentSettings.toggleKeyChar && currentSettings.toggleKeyCode) {
                    currentSettings.toggleKeyChar = currentSettings.toggleKeyCode.replace('Key', '').replace('Digit', '');
                    if (currentSettings.toggleKeyCode === 'Space') currentSettings.toggleKeyChar = ' ';
                } else if (!currentSettings.toggleKeyCode && currentSettings.toggleKeyChar) {
                    currentSettings.toggleKeyCode = getKeyCodeFromChar(currentSettings.toggleKeyChar);
                }
            } catch (e) {
                console.error("Auto-Action: Fehler beim Laden der Einstellungen, verwende Standardeinstellungen:", e);
                currentSettings = { ...defaultSettings };
            }
        } else {
            currentSettings = { ...defaultSettings };
        }
    }

    function saveSettings() {
        localStorage.setItem('tw_auto_action_settings', JSON.stringify(currentSettings));
    }

    // --- Hilfsfunktion zum Umwandeln von Zeichen in event.code ---
    function getKeyCodeFromChar(char) {
        if (!char) return null;
        char = char.toUpperCase();
        if (char.length === 1 && char.match(/[A-Z]/)) {
            return 'Key' + char;
        }
        if (char.length === 1 && char.match(/[0-9]/)) {
            return 'Digit' + char;
        }
        if (char === ' ') return 'Space';
        return null; // Ungültiges Zeichen
    }

    // --- Skript-Variablen ---
    let autoActionActive = false;
    let autoActionIntervalId = null;
    let botProtectionDetected = false; // Neuer Status für Botschutz
    let noFarmButtonsDetected = false; // Neuer Status für fehlende Farm-Buttons

    // --- Hilfsfunktion zum Generieren eines zufälligen Intervalls ---
    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // --- Botschutz-Erkennung ---
    function checkAntiBotProtection() {
        const botProtectionSelectors = [
            '#bot_protect_dialog',
            '.popup_box_container:contains("Sicherheitsabfrage")',
            'div[data-bot-check="true"]',
            'img[src*="captcha"]',
            'input[name="captcha_code"]',
            '.popup_box:contains("Botschutz")',
            '.modem-window:contains("Sicherheitsprüfung")',
            '#recaptcha-challenge',
            '#bot_captcha_div',
            'div.error:contains("Bitte bestätigen Sie, dass Sie kein Bot sind.")'
        ];

        let isBotProtectionVisible = false;
        for (const selector of botProtectionSelectors) {
            const element = $(selector);
            if (element.length > 0 && element.is(':visible')) {
                isBotProtectionVisible = true;
                break;
            }
        }

        if (isBotProtectionVisible) {
            if (!botProtectionDetected) {
                botProtectionDetected = true;
                if (autoActionActive && currentSettings.pauseOnBotProtection) {
                    clearInterval(autoActionIntervalId);
                    autoActionIntervalId = null;
                    autoActionActive = false;
                    if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                        UI.ErrorMessage('Botschutz-Abfrage erkannt! Auto-Action wurde gestoppt!', 5000);
                    }
                    console.warn('TW Auto-Action: Botschutz-Abfrage erkannt. Skript gestoppt.');
                } else if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage('Botschutz-Abfrage erkannt! Auto-Action ist nicht aktiv oder pausiert nicht automatisch.', 5000);
                }
                updateUIStatus(); // UI-Status aktualisieren
            }
            return true; // Botschutz erkannt
        } else {
            if (botProtectionDetected) {
                botProtectionDetected = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Botschutz-Abfrage nicht mehr sichtbar. Auto-Action kann bei Bedarf wieder gestartet werden.', 3000);
                }
                updateUIStatus(); // UI-Status aktualisieren
            }
            return false; // Kein Botschutz erkannt
        }
    }


    // --- Funktion zum Simulieren des Button-Klicks ---
    function simulateButtonClick() {
        // Diese Funktion wird nur aktiv, wenn wir auf der am_farm Seite sind
        if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            // Zuerst Botschutz prüfen
            if (checkAntiBotProtection()) {
                // Botschutz erkannt, Klick überspringen. checkAntiBotProtection hat bereits gestoppt, falls aktiviert.
                return;
            }

            const farmButton = $(FARM_BUTTON_SELECTOR).first(); // Finde den ersten FarmGod Button

            if (farmButton.length > 0 && farmButton.is(':visible') && !farmButton.is(':disabled')) {
                // Buttons gefunden, vorherige "Keine Buttons" Meldung zurücksetzen
                if (noFarmButtonsDetected) {
                    noFarmButtonsDetected = false;
                    updateUIStatus(); // UI aktualisieren, da Buttons wieder da sind
                }
                farmButton.trigger('click'); // Löst den Klick-Event des FarmGod-Buttons aus
            } else {
                // Keine Farm-Buttons gefunden oder sie sind nicht sichtbar/deaktiviert
                if (!noFarmButtonsDetected) { // Nur einmal melden, wenn neu erkannt
                    noFarmButtonsDetected = true;
                    if (autoActionActive) {
                        clearInterval(autoActionIntervalId);
                        autoActionIntervalId = null;
                        autoActionActive = false;
                        if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                            UI.InfoMessage('Keine Farm-Buttons gefunden oder sichtbar. Auto-Action gestoppt!', 3000);
                        }
                        console.log('TW Auto-Action: Keine Farm-Buttons gefunden oder sichtbar. Skript gestoppt.');
                    } else {
                         if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                            UI.InfoMessage('Keine Farm-Buttons gefunden oder sichtbar.', 3000);
                        }
                    }
                    updateUIStatus(); // UI-Status aktualisieren
                }
            }
        } else {
            // Wenn wir nicht auf der Farm-Seite sind und der Clicker aktiv ist, stoppen wir ihn
            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Auto-Action automatisch gestoppt (nicht auf Farm-Seite).', 3000);
                }
                noFarmButtonsDetected = false; // Zurücksetzen, da Seitenwechsel
                botProtectionDetected = false; // Auch zurücksetzen
                updateUIStatus();
            }
        }
    }

    // --- Event Listener für Tastendrücke ---
    document.addEventListener('keydown', (event) => {
        const isHotkeyCombination =
            event.code === currentSettings.toggleKeyCode &&
            event.ctrlKey === currentSettings.requiredCtrl &&
            event.altKey === currentSettings.requiredAlt &&
            event.shiftKey === currentSettings.requiredShift;

        if (isHotkeyCombination) {
            event.preventDefault(); // Verhindere Standard-Browseraktion

            window.toggleTribalAutoAction(); // Rufe die globale Toggle-Funktion auf
        }
    });

    // --- Globale Toggle Funktion für Auto-Action (von Hotkey oder extern triggerbar) ---
    window.toggleTribalAutoAction = function() {
        if (autoActionActive) {
            clearInterval(autoActionIntervalId);
            autoActionIntervalId = null;
            autoActionActive = false;
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Auto-Action gestoppt.', 2000);
            }
            noFarmButtonsDetected = false; // Zurücksetzen beim manuellen Stopp
            botProtectionDetected = false; // Auch zurücksetzen
        } else {
            // Vor dem Start prüfen, ob Botschutz aktiv ist
            if (checkAntiBotProtection()) {
                // checkAntiBotProtection() stoppt das Skript bereits und zeigt die Meldung.
                return; // Skript nicht starten, wenn Botschutz aktiv
            }

            // Vor dem Start prüfen, ob Farm-Buttons überhaupt vorhanden sind
            const farmButtonCheck = $(FARM_BUTTON_SELECTOR).first();
            if (farmButtonCheck.length === 0 || !farmButtonCheck.is(':visible') || farmButtonCheck.is(':disabled')) {
                if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage('Kann Auto-Action nicht starten: Keine Farm-Buttons gefunden oder sie sind nicht sichtbar/aktiv.', 4000);
                }
                noFarmButtonsDetected = true; // Status setzen
                updateUIStatus();
                return; // Skript nicht starten
            }

            autoActionActive = true;
            // Sicherstellen, dass das Intervall nicht gesetzt wird, wenn es bereits läuft
            if (autoActionIntervalId) clearInterval(autoActionIntervalId);

            // Initialen Klick und Intervall setzen
            const initialInterval = getRandomInterval(currentSettings.minInterval, currentSettings.maxInterval);
            autoActionIntervalId = setInterval(() => {
                simulateButtonClick();
                // Nach dem ersten Klick (oder auch wenn kein Klick stattfand wegen Botschutz/fehlender Buttons),
                // das Intervall für den nächsten Klick setzen
                clearInterval(autoActionIntervalId); // Altes Intervall löschen
                if (autoActionActive) { // Nur neues Intervall setzen, wenn noch aktiv
                    autoActionIntervalId = setInterval(simulateButtonClick, getRandomInterval(currentSettings.minInterval, currentSettings.maxInterval));
                }
            }, initialInterval);

            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                let hotkeyDisplay = currentSettings.toggleKeyChar;
                if (currentSettings.requiredCtrl) hotkeyDisplay = 'Strg + ' + hotkeyDisplay;
                if (currentSettings.requiredAlt) hotkeyDisplay = 'Alt + ' + hotkeyDisplay;
                if (currentSettings.requiredShift) hotkeyDisplay = 'Shift + ' + hotkeyDisplay;
                hotkeyDisplay = hotkeyDisplay.replace(/\s\+\s$/, '');

                UI.InfoMessage('Auto-Action gestartet! (Hotkey: ' + hotkeyDisplay + ' zum Stoppen)', 3000);
            }
            noFarmButtonsDetected = false; // Zurücksetzen beim erfolgreichen Start
        }
        updateUIStatus(); // UI-Status aktualisieren (z.B. den Button-Text)
    };


    // --- PRÄZISER SELEKTOR FÜR BELIEBIGEN FARMGOD BUTTON ---
    const FARM_BUTTON_SELECTOR = 'a.farmGod_icon';

    // Global variable to hold the custom dialog element
    let customDialogElement = null;

    // --- Einstellungsdialog (jetzt als eigenes Pop-up) ---
    function openSettingsDialog() {
        // Vorherigen Dialog entfernen, falls vorhanden
        if (customDialogElement) {
            customDialogElement.remove();
            customDialogElement = null;
        }

        const dialogContentHtml = `
            <div id="tw_auto_action_settings_dialog_content" style="padding: 15px; background-color: #f7f3e6; border: 1px solid #804000; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); max-width: 400px; margin: 20px; position: relative;">
                <h3>Auto-Action Einstellungen</h3>
                <style>
                    /* Grundstile für das Pop-up */
                    #tw_auto_action_settings_dialog_content table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    #tw_auto_action_settings_dialog_content th, #tw_auto_action_settings_dialog_content td { padding: 5px; border: 1px solid #ddd; text-align: left; }
                    #tw_auto_action_settings_dialog_content input[type="text"],
                    #tw_auto_action_settings_dialog_content input[type="number"] {
                        width: calc(100% - 12px); /* Angepasst für Padding und Border */
                        padding: 5px;
                        box-sizing: border-box;
                        border: 1px solid #c2c2c2;
                        border-radius: 3px;
                    }
                    #tw_auto_action_settings_dialog_content input[type="checkbox"] { margin-right: 5px; }
                    #tw_auto_action_settings_dialog_content .btn {
                        margin-top: 15px;
                        margin-right: 10px;
                        padding: 8px 15px;
                        cursor: pointer;
                        font-weight: bold;
                        border: 1px solid #804000;
                        border-radius: 3px;
                        background-color: #f0e2b6;
                        color: #5b3617;
                    }
                    #tw_auto_action_settings_dialog_content .btn-red {
                        background-color: #d1b790; /* Etwas dunklerer Braunton */
                        border-color: #6d3300;
                        color: #3b1e0a;
                    }
                    #tw_auto_action_settings_dialog_content h3 {
                        color: #804000;
                        margin-top: 0;
                        border-bottom: 1px solid #804000;
                        padding-bottom: 5px;
                    }
                    #tw_auto_action_settings_dialog_content label {
                        display: inline-flex;
                        align-items: center;
                        margin-bottom: 5px;
                    }
                </style>
                <table class="vis">
                    <tr>
                        <th>Hotkey (Taste)</th>
                        <td><input type="text" id="setting_toggle_key_char" maxlength="1" value="${currentSettings.toggleKeyChar}" style="width: 30px; text-align: center;"></td>
                    </tr>
                    <tr>
                        <th>Benötigte Tasten</th>
                        <td>
                            <label><input type="checkbox" id="setting_required_ctrl" ${currentSettings.requiredCtrl ? 'checked' : ''}> Strg</label><br>
                            <label><input type="checkbox" id="setting_required_alt" ${currentSettings.requiredAlt ? 'checked' : ''}> Alt</label><br>
                            <label><input type="checkbox" id="setting_required_shift" ${currentSettings.requiredShift ? 'checked' : ''}> Shift</label>
                        </td>
                    </tr>
                    <tr>
                        <th>Min. Abstand (ms)</th>
                        <td><input type="number" id="setting_min_interval" min="50" max="10000" value="${currentSettings.minInterval}"></td>
                    </tr>
                    <tr>
                        <th>Max. Abstand (ms)</th>
                        <td><input type="number" id="setting_max_interval" min="50" max="10000" value="${currentSettings.maxInterval}"></td>
                    </tr>
                    <tr>
                        <th>Botschutz pausieren</th>
                        <td><input type="checkbox" id="setting_pause_on_bot_protection" ${currentSettings.pauseOnBotProtection ? 'checked' : ''}> Bei Botschutz-Abfrage pausieren</td>
                    </tr>
                </table>
                <button id="tw_auto_action_save_settings" class="btn">Speichern</button>
                <button id="tw_auto_action_close_settings" class="btn btn-red">Schließen</button>
            </div>
        `;

        // Create the overlay and dialog container
        customDialogElement = $(`
            <div id="tw_auto_action_custom_dialog_overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100000; display: flex; justify-content: center; align-items: center; overflow-y: auto;">
                ${dialogContentHtml}
            </div>
        `);

        $('body').append(customDialogElement);

        // Re-attach event listeners after insertion
        $('#tw_auto_action_save_settings').on('click', () => {
            const newToggleKeyChar = $('#setting_toggle_key_char').val().toUpperCase();
            const newToggleKeyCode = getKeyCodeFromChar(newToggleKeyChar);

            if (!newToggleKeyCode) {
                if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage("Ungültige Hotkey-Taste. Verwende A-Z, 0-9 oder Leerzeichen.", 3000);
                }
                return;
            }

            let newMinInterval = parseInt($('#setting_min_interval').val(), 10);
            let newMaxInterval = parseInt($('#setting_max_interval', 10).val());

            if (isNaN(newMinInterval) || newMinInterval < 50) newMinInterval = 50;
            if (isNaN(newMaxInterval) || newMaxInterval < newMinInterval) newMaxInterval = newMinInterval + 100;

            currentSettings.toggleKeyChar = newToggleKeyChar;
            currentSettings.toggleKeyCode = newToggleKeyCode;
            currentSettings.requiredCtrl = $('#setting_required_ctrl').is(':checked');
            currentSettings.requiredAlt = $('#setting_required_alt').is(':checked');
            currentSettings.requiredShift = $('#setting_required_shift').is(':checked');
            currentSettings.minInterval = newMinInterval;
            currentSettings.maxInterval = newMaxInterval;
            currentSettings.pauseOnBotProtection = $('#setting_pause_on_bot_protection').is(':checked'); // Neue Einstellung speichern

            saveSettings();
            customDialogElement.remove(); // Close the custom dialog
            customDialogElement = null; // Reset reference
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Einstellungen gespeichert!', 2000);
            }

            // Wenn Skript aktiv war, pausieren und neu starten mit neuen Einstellungen
            // Dies ist wichtig, da sich die Intervall-Einstellungen geändert haben könnten
            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false; // Set to false so toggleTribalAutoAction can restart it properly
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Skript pausiert. Starte per Hotkey oder extern zum Neustart mit neuen Einstellungen.', 3000);
                }
            }
            updateUIStatus();
        });

        $('#tw_auto_action_close_settings').on('click', () => {
            customDialogElement.remove(); // Close the custom dialog
            customDialogElement = null; // Reset reference
        });
    }

    // --- Einstellungs-Button auf der Farm-Seite hinzufügen ---
    let settingsButtonRef = null; // Referenz zum Einstellungs-Button für Status-Updates

    function updateUIStatus() {
        if (settingsButtonRef) {
            let statusText = autoActionActive ? ' (Aktiv)' : ' (Inaktiv)';
            let backgroundColor = autoActionActive ? '#d4edda' : '#f0e2b6'; // Grün wenn aktiv, Standard wenn inaktiv
            let textColor = autoActionActive ? '#155724' : '#5b3617';
            let borderColor = autoActionActive ? '#28a745' : '#804000';

            if (botProtectionDetected) {
                statusText = ' (Botschutz erkannt - Inaktiv)';
                backgroundColor = '#f8d7da'; // Helles Rot
                textColor = '#721c24';     // Dunkles Rot
                borderColor = '#dc3545';   // Roter Rand
            } else if (noFarmButtonsDetected) { // Neuer Status für fehlende Buttons
                statusText = ' (Keine Farm-Buttons gefunden - Inaktiv)';
                backgroundColor = '#fff3cd'; // Gelblich
                textColor = '#856404';     // Dunkelgelb
                borderColor = '#ffeeba';   // Gelber Rand
            }

            settingsButtonRef.text('Auto-Action Einstellungen' + statusText);
            settingsButtonRef.css({
                'background-color': backgroundColor,
                'color': textColor,
                'border-color': borderColor
            });
        }
    }


    function addAmFarmSettingsButton() {
        if (typeof game_data === 'undefined' || game_data.screen !== 'am_farm') {
            return;
        }

        const settingsButtonHtml = `
            <a href="#" id="tw_auto_action_settings_button" class="btn" style="white-space: nowrap; margin-bottom: 10px; display: inline-block;">
                Auto-Action Einstellungen
            </a>
        `;
        const accountManagerHeading = $('#content_value h2:contains("Account Manager"), #content_value h3:contains("Account Manager")');

        if (accountManagerHeading.length > 0) {
            $(settingsButtonHtml).insertBefore(accountManagerHeading.first());
        } else {
            const contentValue = $('#content_value');
            if (contentValue.length > 0) {
                contentValue.prepend(settingsButtonHtml);
            } else {
                $('body').append(settingsButtonHtml);
                $('#tw_auto_action_settings_button').css({
                    'position': 'fixed',
                    'bottom': '10px',
                    'right': '10px',
                    'z-index': '10000',
                    'margin-bottom': '0'
                });
            }
        }

        settingsButtonRef = $('#tw_auto_action_settings_button');
        if (settingsButtonRef.length > 0) {
            settingsButtonRef.on('click', (e) => {
                e.preventDefault();
                openSettingsDialog();
            });
        } else {
            if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                UI.ErrorMessage("Auto-Action: Einstellungs-Button konnte nicht eingefügt werden. Skript-Fehler.", 3000);
            }
        }
        updateUIStatus(); // Initialen Status setzen
    }


    // --- Skript-Initialisierung ---
    loadSettings();

    $(document).ready(function() {
        addAmFarmSettingsButton();

        setTimeout(() => {
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                let hotkeyDisplay = currentSettings.toggleKeyChar;
                if (currentSettings.requiredCtrl) hotkeyDisplay = 'Strg + ' + hotkeyDisplay;
                if (currentSettings.requiredAlt) hotkeyDisplay = 'Alt + ' + hotkeyDisplay;
                if (currentSettings.requiredShift) hotkeyDisplay = 'Shift + ' + hotkeyDisplay;
                hotkeyDisplay = hotkeyDisplay.replace(/\s\+\s$/, '');

                UI.InfoMessage('TW Auto-Action (v3.6) ist bereit. Starte per Hotkey: ' + hotkeyDisplay + ' oder über externen JavaScript-Aufruf (window.toggleTribalAutoAction()).', 3000);
            }
        }, 1000);

        // Überwache das DOM auf Änderungen, die auf Botschutz oder fehlende Buttons hindeuten könnten
        const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }; // Optimierte Attribute

        const observer = new MutationObserver((mutationsList, observer) => {
            // Nur prüfen, wenn das Skript aktiv sein sollte oder ein Problem vorlag
            if (autoActionActive || botProtectionDetected || noFarmButtonsDetected) {
                const relevantChange = mutationsList.some(mutation =>
                    mutation.type === 'childList' ||
                    (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
                );

                if (relevantChange) {
                    // Prüfe beides: Botschutz und Button-Verfügbarkeit
                    checkAntiBotProtection();
                    if (game_data.screen === 'am_farm' && !botProtectionDetected) { // Nur prüfen, wenn auf Farm-Seite und kein Botschutz
                        const farmButton = $(FARM_BUTTON_SELECTOR).first();
                        if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                            if (autoActionActive) { // Wenn Buttons verschwunden und Skript noch aktiv
                                clearInterval(autoActionIntervalId);
                                autoActionIntervalId = null;
                                autoActionActive = false;
                                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                                    UI.InfoMessage('Keine Farm-Buttons mehr gefunden/sichtbar. Auto-Action gestoppt!', 3000);
                                }
                            }
                            if (!noFarmButtonsDetected) { // Nur einmal melden
                                noFarmButtonsDetected = true;
                                updateUIStatus();
                            }
                        } else {
                            if (noFarmButtonsDetected) { // Buttons wieder da
                                noFarmButtonsDetected = false;
                                updateUIStatus();
                                // Optional: Wenn Skript vorher wegen fehlender Buttons gestoppt wurde, jetzt starten?
                                // Nein, das wäre unerwartetes Verhalten. Benutzer soll es manuell starten.
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, observerConfig);

        // Initialprüfung beim Laden der Seite
        checkAntiBotProtection();
        // Auch Farm-Buttons initial prüfen, falls schon beim Laden keine da sind
        if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            const farmButton = $(FARM_BUTTON_SELECTOR).first();
            if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                noFarmButtonsDetected = true;
                updateUIStatus();
            }
        }
    });

})();
