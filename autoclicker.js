// ==UserScript==
// @name          TW Auto-Action (Hotkey & Externe Trigger)
// @namespace     TribalWars
// @version       3.18 // Version auf 3.18 aktualisiert - Zweiter Test-Ton Button für Automation
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

    const SCRIPT_VERSION = '3.18'; // Die aktuelle Version des Skripts

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
                if (!currentSettings.toggleKeyChar && currentSettings.toggleKeyCode) {
                    currentSettings.toggleKeyChar = currentSettings.toggleKeyCode.replace('Key', '').replace('Digit', '');
                    if (currentSettings.toggleKeyCode === 'Space') currentSettings.toggleKeyChar = ' ';
                } else if (!currentSettings.toggleKeyChar && currentSettings.toggleKeyChar) {
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
        if (char === ' ') return 'Space';
        return null; // For numbers and other characters, default to null for now
    }


    // --- Skript-Variablen ---
    let autoActionActive = false;
    let autoActionIntervalId = null;
    let botProtectionDetected = false;
    let noFarmButtonsDetected = false;

    // --- Hilfsfunktion zum Generieren eines zufälligen Intervalls ---
    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // --- Ton abspielen ---
    let audioCtx = null; // Globale Referenz für AudioContext

    function createAndPlayOscillator() {
        if (!audioCtx || audioCtx.state === 'closed') {
            console.warn('TW Auto-Action: AudioContext nicht bereit für die Wiedergabe.');
            return;
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, audioCtx.currentTime); // Frequenz (A#5) für bessere Hörbarkeit
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); // Lautstärke etwas erhöhen (0.0 bis 1.0)

        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8); // Ton etwas länger (0.8s)
        oscillator.stop(audioCtx.currentTime + 0.8);
        console.log('TW Auto-Action: Oszillator-Ton gestartet.');
    }

    function playAntiBotSound() {
        console.log('TW Auto-Action: Versuche Botschutz-Ton abzuspielen...');
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('TW Auto-Action: AudioContext initialisiert. Zustand:', audioCtx.state);
            }

            if (audioCtx.state === 'suspended') {
                console.log('TW Auto-Action: AudioContext ist ausgesetzt, versuche Fortsetzung...');
                audioCtx.resume().then(() => {
                    console.log('TW Auto-Action: AudioContext erfolgreich fortgesetzt und Ton wird abgespielt.');
                    createAndPlayOscillator();
                }).catch(e => {
                    console.warn("TW Auto-Action: Fehler beim Fortsetzen des AudioContext.", e);
                });
            } else if (audioCtx.state === 'running') {
                console.log('TW Auto-Action: AudioContext läuft bereits, Ton wird abgespielt.');
                createAndPlayOscillator();
            } else {
                console.warn('TW Auto-Action: AudioContext ist in unerwartetem Zustand:', audioCtx.state);
            }
        } catch (e) {
            console.warn("TW Auto-Action: Fehler beim Initialisieren oder Abspielen des Anti-Bot-Sounds.", e);
        }
    }


    // --- Botschutz-Erkennung ---
    function checkAntiBotProtection() {
        const botProtectionSelectors = [
            'div#botprotection_quest', // Das Männchen-Icon selbst
            'div[data-id="bot_protection"]', // Das Haupt-Popup (z.B. hCaptcha)
            '#popup_box_bot_protection',     // Das Haupt-Popup (ID)
            'div#tooltip:contains("Bot-Schutz")', // Das Tooltip, das beim Hover über das Männchen erscheinen kann
            '#bot_protect_dialog', // Älterer, allgemeiner Dialog
            '.popup_box_container:contains("Sicherheitsabfrage")',
            '.popup_box_container:contains("Bot-Schutz")',
            'div[data-bot-check="true"]',
            'img[src*="captcha"]',
            'input[name="captcha_code"]',
            '.modem-window:contains("Sicherheitsprüfung")',
            '#recaptcha-challenge',
            '#bot_captcha_div',
            'div.error:contains("Bitte bestätigen Sie, dass Sie kein Bot sind.")',
        ];

        let isBotProtectionVisible = false;
        for (const selector of botProtectionSelectors) {
            const element = $(selector);
            // Zusätzliche Prüfungen für Sichtbarkeit und "aktiv" sein
            if (element.length > 0 && element.is(':visible') && element.css('display') !== 'none' && element.css('visibility') !== 'hidden' && element.attr('disabled') !== 'disabled') {
                isBotProtectionVisible = true;
                break;
            }
        }

        if (isBotProtectionVisible) {
            if (!botProtectionDetected) {
                botProtectionDetected = true;
                playAntiBotSound();

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
                updateUIStatus();
            }
            return true;
        } else {
            if (botProtectionDetected) {
                botProtectionDetected = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Botschutz-Abfrage nicht mehr sichtbar. Auto-Action kann bei Bedarf wieder gestartet werden.', 3000);
                }
                updateUIStatus();
            }
            return false;
        }
    }


    // --- Funktion zum Simulieren des Button-Klicks ---
    function simulateButtonClick() {
        if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            if (checkAntiBotProtection()) {
                return;
            }

            const farmButton = $(FARM_BUTTON_SELECTOR).first();

            if (farmButton.length > 0 && farmButton.is(':visible') && !farmButton.is(':disabled')) {
                if (noFarmButtonsDetected) {
                    noFarmButtonsDetected = false;
                    updateUIStatus();
                }
                farmButton.trigger('click');
            } else {
                if (!noFarmButtonsDetected) {
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
                    updateUIStatus();
                }
            }
        } else {
            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Auto-Action automatisch gestoppt (nicht auf Farm-Seite).', 3000);
                }
                noFarmButtonsDetected = false;
                botProtectionDetected = false;
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
            event.preventDefault();

            window.toggleTribalAutoAction();
        }
    });

    // --- Globale Toggle Funktion für Auto-Action ---
    window.toggleTribalAutoAction = function() {
        if (autoActionActive) {
            clearInterval(autoActionIntervalId);
            autoActionIntervalId = null;
            autoActionActive = false;
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Auto-Action gestoppt.', 2000);
            }
            noFarmButtonsDetected = false;
            botProtectionDetected = false;
        } else {
            // Beim Starten des Skripts durch Nutzerinteraktion: Versuche AudioContext zu aktivieren
            if (!audioCtx) { // Ensure audioCtx exists before trying to resume outside of playAntiBotSound
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => {
                    console.log('TW Auto-Action: AudioContext beim Starten fortgesetzt durch Benutzerinteraktion.');
                }).catch(e => {
                    console.warn('TW Auto-Action: Fehler beim Fortsetzen des AudioContext beim Starten durch Benutzerinteraktion.', e);
                });
            }

            if (checkAntiBotProtection()) {
                return;
            }

            const farmButtonCheck = $(FARM_BUTTON_SELECTOR).first();
            if (farmButtonCheck.length === 0 || !farmButtonCheck.is(':visible') || farmButtonCheck.is(':disabled')) {
                if (typeof UI !== 'undefined' && typeof UI.ErrorMessage === 'function') {
                    UI.ErrorMessage('Kann Auto-Action nicht starten: Keine Farm-Buttons gefunden oder sie sind nicht sichtbar/aktiv.', 4000);
                }
                noFarmButtonsDetected = true;
                updateUIStatus();
                return;
            }

            autoActionActive = true;
            if (autoActionIntervalId) clearInterval(autoActionIntervalId);

            const initialInterval = getRandomInterval(currentSettings.minInterval, currentSettings.maxInterval);
            autoActionIntervalId = setInterval(() => {
                simulateButtonClick();
                clearInterval(autoActionIntervalId);
                if (autoActionActive) {
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
            noFarmButtonsDetected = false;
        }
        updateUIStatus();
    };

    // --- PRÄZISER SELEKTOR FÜR BELIEBIGEN FARMGOD BUTTON ---
    const FARM_BUTTON_SELECTOR = 'a.farmGod_icon';

    let customDialogElement = null;

    // --- Einstellungsdialog ---
    function openSettingsDialog() {
        if (customDialogElement) {
            customDialogElement.remove();
            customDialogElement = null;
        }

        const dialogContentHtml = `
            <div id="tw_auto_action_settings_dialog_content" style="padding: 15px; background-color: #f7f3e6; border: 1px solid #804000; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); max-width: 400px; margin: 20px; position: relative;">
                <h3>Auto-Action Einstellungen (v${SCRIPT_VERSION})</h3>
                <style>
                    #tw_auto_action_settings_dialog_content table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    #tw_auto_action_settings_dialog_content th, #tw_auto_action_settings_dialog_content td { padding: 5px; border: 1px solid #ddd; text-align: left; }
                    #tw_auto_action_settings_dialog_content input[type="text"],
                    #tw_auto_action_settings_dialog_content input[type="number"] {
                        width: calc(100% - 12px);
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
                        background-color: #d1b790;
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
                <button id="tw_auto_action_test_sound_immediate" class="btn">Test-Ton abspielen (sofort)</button>
                <button id="tw_auto_action_test_sound_automation" class="btn">Test-Ton Automation (nach 5s Verzögerung)</button>
                <button id="tw_auto_action_save_settings" class="btn">Speichern</button>
                <button id="tw_auto_action_close_settings" class="btn btn-red">Schließen</button>
            </div>
        `;

        customDialogElement = $(`
            <div id="tw_auto_action_custom_dialog_overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 100000; display: flex; justify-content: center; align-items: center; overflow-y: auto;">
                ${dialogContentHtml}
            </div>
        `);

        $('body').append(customDialogElement);

        // Event Listener für den sofortigen Test-Button
        $('#tw_auto_action_test_sound_immediate').on('click', () => {
            playAntiBotSound(); // Ton sofort abspielen
        });

        // Event Listener für den neuen Automation Test-Button
        $('#tw_auto_action_test_sound_automation').on('click', () => {
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Test-Ton für Automation wird in 5 Sekunden abgespielt. Bitte zuerst "Test-Ton abspielen (sofort)" klicken, um Audio zu entsperren!', 6000);
            }
            console.log('TW Auto-Action: Test-Ton Automation in 5 Sekunden geplant.');
            setTimeout(() => {
                playAntiBotSound();
            }, 5000); // 5 Sekunden Verzögerung
        });


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
            currentSettings.pauseOnBotProtection = $('#setting_pause_on_bot_protection').is(':checked');

            saveSettings();
            customDialogElement.remove();
            customDialogElement = null;
            if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                UI.InfoMessage('Einstellungen gespeichert!', 2000);
            }

            if (autoActionActive) {
                clearInterval(autoActionIntervalId);
                autoActionIntervalId = null;
                autoActionActive = false;
                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                    UI.InfoMessage('Skript pausiert. Starte per Hotkey oder extern zum Neustart mit neuen Einstellungen.', 3000);
                }
            }
            updateUIStatus();
        });

        $('#tw_auto_action_close_settings').on('click', () => {
            customDialogElement.remove();
            customDialogElement = null;
        });
    }

    // --- Einstellungs-Button auf der Farm-Seite hinzufügen ---
    let settingsButtonRef = null;

    function updateUIStatus() {
        if (settingsButtonRef) {
            let statusText = autoActionActive ? ' (Aktiv)' : ' (Inaktiv)';
            let backgroundColor = autoActionActive ? '#d4edda' : '#f0e2b6';
            let textColor = autoActionActive ? '#155724' : '#5b3617';
            let borderColor = autoActionActive ? '#28a745' : '#804000';

            if (botProtectionDetected) {
                statusText = ' (Botschutz erkannt - Inaktiv)';
                backgroundColor = '#f8d7da';
                textColor = '#721c24';
                borderColor = '#dc3545';
            } else if (noFarmButtonsDetected) {
                statusText = ' (Keine Farm-Buttons gefunden - Inaktiv)';
                backgroundColor = '#fff3cd';
                textColor = '#856404';
                borderColor = '#ffeeba';
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
        updateUIStatus();
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

                UI.InfoMessage('TW Auto-Action (v' + SCRIPT_VERSION + ') ist bereit. Starte per Hotkey: ' + hotkeyDisplay + ' oder über externen JavaScript-Aufruf (window.toggleTribalAutoAction()).', 3000);
            }
        }, 1000);

        const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] };

        const observer = new MutationObserver((mutationsList, observer) => {
            if (autoActionActive || botProtectionDetected || noFarmButtonsDetected) {
                const relevantChange = mutationsList.some(mutation =>
                    mutation.type === 'childList' ||
                    (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
                );

                if (relevantChange) {
                    checkAntiBotProtection();
                    if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm' && !botProtectionDetected) {
                        const farmButton = $(FARM_BUTTON_SELECTOR).first();
                        if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                            if (autoActionActive) {
                                clearInterval(autoActionIntervalId);
                                autoActionIntervalId = null;
                                autoActionActive = false;
                                if (typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                                    UI.InfoMessage('Keine Farm-Buttons mehr gefunden/sichtbar. Auto-Action gestoppt!', 3000);
                                }
                            }
                            if (!noFarmButtonsDetected) {
                                noFarmButtonsDetected = true;
                                updateUIStatus();
                            }
                        } else {
                            if (noFarmButtonsDetected) {
                                noFarmButtonsDetected = false;
                                updateUIStatus();
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, observerConfig);

        // Initialprüfung beim Laden der Seite
        checkAntiBotProtection();
        if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
            const farmButton = $(FARM_BUTTON_SELECTOR).first();
            if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                noFarmButtonsDetected = true;
                updateUIStatus();
            }
        }
    });

})();
