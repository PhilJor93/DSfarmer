// ==UserScript==
// @name          TW Auto-Action (Hotkey & Externe Trigger)
// @namespace     TribalWars
// @version       3.4.1 // Version auf 3.4.1 aktualisiert - Positionierung korrigiert
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

    const SCRIPT_VERSION = '3.4.1'; // Die aktuelle Version des Skripts

    // Speichert den ursprünglichen Titel des Dokuments
    const originalDocumentTitle = document.title;

    // --- Sound-Profile Definitionen ---
    const soundProfiles = {
        'default': { name: 'Standard (Hell)', frequency: 660, type: 'sine', duration: 0.8, volume: 0.5 },
        'alarm': { name: 'Alarm (Kurz & Hoch)', frequency: 880, type: 'triangle', duration: 0.4, volume: 0.6 },
        'chime': { name: 'Glocke (Tief & Langsam)', frequency: 440, type: 'sine', duration: 1.2, volume: 0.4 },
        'beep': { name: 'Beep (Standard-Signal)', frequency: 750, type: 'square', duration: 0.2, volume: 0.7 },
        'high_alert': { name: 'Hoher Alarm', frequency: 1000, type: 'sawtooth', duration: 0.3, volume: 0.7 },
        'soft_chime': { name: 'Sanfte Glocke', frequency: 523.25, type: 'sine', duration: 0.6, volume: 0.4 }, // C5
        'deep_thump': { name: 'Tiefer Puls', frequency: 120, type: 'square', duration: 0.5, volume: 0.8 },
        'quick_blip': { name: 'Kurzer Blip', frequency: 1500, type: 'sine', duration: 0.1, volume: 0.6 }
    };

    // --- Standardeinstellungen ---
    const defaultSettings = {
        minInterval: 200,
        maxInterval: 500,
        toggleKeyCode: 'KeyE', // Standard: 'E'
        toggleKeyChar: 'E', // Zeichen für die Anzeige im UI
        requiredCtrl: true,
        requiredAlt: false,
        requiredShift: true,
        pauseOnBotProtection: true, // Einstellung: Bei Botschutz pausieren
        soundEnabled: true, // Botschutz-Ton aktiviert
        selectedSound: 'default' // Standard: 'default' Sound
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
                } else if (currentSettings.toggleKeyChar && !currentSettings.toggleKeyCode) {
                    currentSettings.toggleKeyCode = getKeyCodeFromChar(currentSettings.toggleKeyChar);
                }
                if (!soundProfiles[currentSettings.selectedSound]) {
                    currentSettings.selectedSound = 'default';
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
        if (char.length === 1 && char.match(/[0-9]/)) {
            return 'Digit' + char;
        }
        return null;
    }

    // --- Skript-Variablen ---
    let autoActionActive = false;
    let autoActionIntervalId = null;
    let botProtectionDetected = false;
    let noFarmButtonsDetected = false;
    let initialReadyMessageShown = false; // Flag für die initiale Nachricht

    // --- Hilfsfunktion zum Generieren eines zufälligen Intervalls ---
    function getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // --- AudioContext und Sound-Funktionen ---
    let audioCtx = null; // Globale Referenz für AudioContext

    function createAndPlayOscillator(profile) {
        if (!audioCtx || audioCtx.state === 'closed') {
            console.warn('TW Auto-Action: AudioContext nicht bereit für die Wiedergabe des Oszillators.');
            return;
        }
        try {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.type = profile.type;
            oscillator.frequency.setValueAtTime(profile.frequency, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(profile.volume, audioCtx.currentTime);

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + profile.duration);
            oscillator.stop(audioCtx.currentTime + profile.duration);
            console.log(`TW Auto-Action: Oszillator-Ton '${profile.name}' gestartet.`);
        } catch (e) {
            console.error("TW Auto-Action: FEHLER beim Erzeugen oder Starten des Oszillators.", e);
        }
    }

    function triggerAntiBotSound() {
        console.log('TW Auto-Action: Trigger Botschutz-Ton (geprüft nach Einstellung)...');
        if (!currentSettings.soundEnabled) {
            console.log('TW Auto-Action: Botschutz-Ton ist in den Einstellungen deaktiviert. Überspringe Wiedergabe.');
            return;
        }

        try {
            if (!audioCtx || audioCtx.state === 'closed') {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('TW Auto-Action: AudioContext initialisiert (durch Botschutz-Trigger). Zustand:', audioCtx.state);
            }

            const actuallyPlaySound = () => {
                   const profile = soundProfiles[currentSettings.selectedSound] || soundProfiles['default'];
                   console.log('TW Auto-Action: Botschutz-Ton wird abgespielt.');
                   createAndPlayOscillator(profile);
            };

            if (audioCtx.state === 'suspended') {
                console.log('TW Auto-Action: AudioContext ist ausgesetzt (durch Botschutz-Trigger), versuche Fortsetzung...');
                audioCtx.resume().then(() => {
                    console.log('TW Auto-Action: AudioContext erfolgreich fortgesetzt (durch Botschutz-Trigger).');
                    actuallyPlaySound();
                }).catch(e => {
                    console.error("TW Auto-Action: FEHLER beim Fortsetzen des AudioContext (durch Botschutz-Trigger).", e);
                });
            } else if (audioCtx.state === 'running') {
                console.log('TW Auto-Action: AudioContext läuft bereits (durch Botschutz-Trigger).');
                actuallyPlaySound();
            } else {
                console.warn('TW Auto-Action: AudioContext ist in unerwartetem Zustand (durch Botschutz-Trigger):', audioCtx.state);
            }
        } catch (e) {
            console.error("TW Auto-Action: KRITISCHER FEHLER beim Initialisieren oder Abspielen des Anti-Bot-Sounds (durch Botschutz-Trigger).", e);
        }
    }

    function playActivationTestTone() {
        console.log('TW Auto-Action: Test-Ton durch Aktivierungs-Button angefordert...');
        try {
            if (!audioCtx || audioCtx.state === 'closed') {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('TW Auto-Action: AudioContext initialisiert (durch Aktivierungs-Button). Zustand:', audioCtx.state);
            }

            const profileToPlay = soundProfiles[currentSettings.selectedSound] || soundProfiles['default'];

            if (audioCtx.state === 'suspended') {
                console.log('TW Auto-Action: AudioContext ist ausgesetzt (durch Aktivierungs-Button), versuche Fortsetzung...');
                audioCtx.resume().then(() => {
                    console.log('TW Auto-Action: AudioContext erfolgreich fortgesetzt (durch Aktivierungs-Button), spiele Test-Ton ab.');
                    createAndPlayOscillator(profileToPlay);
                }).catch(e => {
                    console.error("TW Auto-Action: FEHLER beim Fortsetzen des AudioContext (durch Aktivierungs-Button).", e);
                });
            } else if (audioCtx.state === 'running') {
                console.log('TW Auto-Action: AudioContext läuft bereits (durch Aktivierungs-Button), spiele Test-Ton ab.');
                createAndPlayOscillator(profileToPlay);
            } else {
                console.warn('TW Auto-Action: AudioContext ist in unerwartetem Zustand (durch Aktivierungs-Button):', audioCtx.state);
            }
        } catch (e) {
            console.error("TW Auto-Action: KRITISCHER FEHLER beim Initialisieren oder Abspielen des Test-Tons (durch Aktivierungs-Button).", e);
        }
    }

    function playSelectedSoundPreview() {
        const selectedKey = $('#setting_selected_sound').val();
        const profile = soundProfiles[selectedKey] || soundProfiles['default'];

        console.log(`TW Auto-Action: Spiele Vorschau-Ton: ${profile.name}`);

        try {
            if (!audioCtx || audioCtx.state === 'closed') {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                console.log('TW Auto-Action: AudioContext initialisiert (für Vorschau). Zustand:', audioCtx.state);
            }

            if (audioCtx.state === 'suspended') {
                console.log('TW Auto-Action: AudioContext ist ausgesetzt (für Vorschau), versuche Fortsetzung...');
                audioCtx.resume().then(() => {
                    console.log('TW Auto-Action: AudioContext erfolgreich fortgesetzt (für Vorschau).');
                    createAndPlayOscillator(profile);
                }).catch(e => {
                    console.error("TW Auto-Action: FEHLER beim Fortsetzen des AudioContext (für Vorschau).", e);
                });
            } else if (audioCtx.state === 'running') {
                console.log('TW Auto-Action: AudioContext läuft bereits (für Vorschau).');
                createAndPlayOscillator(profile);
            } else {
                console.warn('TW Auto-Action: AudioContext ist in unerwartetem Zustand (für Vorschau):', audioCtx.state);
            }
        } catch (e) {
            console.error("TW Auto-Action: KRITISCHER FEHLER beim Initialisieren oder Abspielen des Vorschau-Tons.", e);
        }
    }

    // --- Botschutz-Erkennung ---
    function checkAntiBotProtection() {
        const botProtectionSelectors = [
            'div#botprotection_quest',
            'div[data-id="bot_protection"]',
            '#popup_box_bot_protection',
            'div#tooltip:contains("Bot-Schutz")',
            '#bot_protect_dialog',
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
            if (element.length > 0 && element.is(':visible') && element.css('display') !== 'none' && element.css('visibility') !== 'hidden' && element.attr('disabled') !== 'disabled') {
                isBotProtectionVisible = true;
                break;
            }
        }

        if (isBotProtectionVisible) {
            if (!botProtectionDetected) {
                botProtectionDetected = true;
                triggerAntiBotSound();
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
            playActivationTestTone();

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
                    #tw_auto_action_settings_dialog_content select {
                        width: calc(100% - 80px);
                        padding: 5px;
                        box-sizing: border-box;
                        border: 1px solid #c2c2c2;
                        border-radius: 3px;
                        display: inline-block;
                        vertical-align: middle;
                    }
                    #tw_auto_action_settings_dialog_content #tw_auto_action_preview_sound {
                        width: auto;
                        padding: 5px 10px;
                        margin-left: 5px;
                        margin-top: 0;
                        display: inline-block;
                        vertical-align: middle;
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
                    <tr>
                        <th>Botschutz-Ton</th>
                        <td>
                            <label><input type="checkbox" id="setting_sound_enabled" ${currentSettings.soundEnabled ? 'checked' : ''}> Ton abspielen</label><br>
                            <select id="setting_selected_sound">
                                ${Object.keys(soundProfiles).map(key => `
                                    <option value="${key}" ${currentSettings.selectedSound === key ? 'selected' : ''}>${soundProfiles[key].name}</option>
                                `).join('')}
                            </select>
                            <button id="tw_auto_action_preview_sound" class="btn">Hören</button>
                        </td>
                    </tr>
                </table>
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
            let newMaxInterval = parseInt($('#setting_max_interval').val(), 10);

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
            currentSettings.soundEnabled = $('#setting_sound_enabled').is(':checked');
            currentSettings.selectedSound = $('#setting_selected_sound').val();

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

        $('#tw_auto_action_preview_sound').on('click', (e) => {
            e.preventDefault();
            playSelectedSoundPreview();
        });
    }

    // --- Einstellungs-Button auf der Farm-Seite hinzufügen ---
    let settingsButtonRef = null;
    let toggleButtonRef = null;
    let statusBarRef = null;
    let mainContainerRef = null;

    function updateUIStatus() {
        let currentTabTitle = originalDocumentTitle;
        let currentStatusText = 'TW Auto-Action ist bereit.';
        let statusBarBgColor = '#ffc107';

        const defaultButtonBg = '#f0e2b6';
        const defaultButtonBorder = '#804000';
        const defaultButtonText = '#FFFFFF'; // Textfarbe ist weiß

        if (settingsButtonRef) {
            settingsButtonRef.css({
                'background-color': defaultButtonBg,
                'color': defaultButtonText,
                'border-color': defaultButtonBorder
            });
        }

        if (toggleButtonRef) {
            toggleButtonRef.text(autoActionActive ? 'Auto-Action Stopp' : 'Auto-Action Start');
            toggleButtonRef.css({
                'background-color': defaultButtonBg,
                'color': defaultButtonText,
                'border-color': defaultButtonBorder
            });
        }

        if (botProtectionDetected) {
            statusBarBgColor = '#dc3545';
            currentTabTitle = `[BOTSCHUTZ PAUSE] TW Auto-Action | ${originalDocumentTitle}`;
            currentStatusText = '[BOTSCHUTZ] Auto-Action pausiert!';
        } else if (autoActionActive) {
            statusBarBgColor = '#28a745';
            currentTabTitle = `[AKTIV] TW Auto-Action | ${originalDocumentTitle}`;
            currentStatusText = '[AKTIV] Auto-Action läuft...';
        } else if (noFarmButtonsDetected) {
            statusBarBgColor = '#ffc107';
            currentTabTitle = `[KEINE BUTTONS] TW Auto-Action | ${originalDocumentTitle}`;
            currentStatusText = '[KEINE BUTTONS] Auto-Action gestoppt.';
        } else {
            statusBarBgColor = '#ffc107';
            currentStatusText = 'Auto-Action ist inaktiv.';
        }

        document.title = currentTabTitle;

        if (statusBarRef) {
            statusBarRef.text(currentStatusText);
            statusBarRef.css({
                'background-color': statusBarBgColor,
                'color': '#ffffff'
            });
        }
    }

    function addAmFarmSettingsButton() {
        if (typeof game_data === 'undefined' || game_data.screen !== 'am_farm' || typeof $ === 'undefined') {
            console.log("TW Auto-Action: Nicht auf Farm-Seite oder jQuery nicht geladen.");
            return;
        }

        // Finde das Haupt-Content-Element der Farm-Seite
        const contentValue = $('#content_value');
        if (contentValue.length === 0) {
            console.warn("TW Auto-Action: Konnte das '#content_value' Element nicht finden. Buttons werden nicht angezeigt.");
            return;
        }

        // Versuche, das erste "vis" (Standard-Tabellen-Stil) Tabelle zu finden und davor einzufügen
        let targetElement = contentValue.find('table.vis').first();

        // Fallback: Wenn keine 'table.vis' gefunden, versuche es vor der ersten 'h3' oder direkt im 'content_value'
        if (targetElement.length === 0) {
            targetElement = contentValue.find('h3').first();
            if (targetElement.length === 0) {
                 targetElement = contentValue; // Notfalls direkt in content_value
            }
        }

        const buttonBaseStyle = `
            white-space: nowrap;
            display: inline-block;
            padding: 8px 15px;
            cursor: pointer;
            font-weight: bold;
            border-radius: 3px;
            color: #FFFFFF; /* Textfarbe ist weiß */
            background-color: #f0e2b6;
            border: 1px solid #804000;
        `;

        const toggleButtonHtml = `<a href="#" id="tw_auto_action_toggle_button" class="btn" style="${buttonBaseStyle}">Auto-Action Start/Stopp</a>`;
        const settingsButtonHtml = `<a href="#" id="tw_auto_action_settings_button" class="btn" style="${buttonBaseStyle}">Auto-Action Einstellungen</a>`;

        const statusBarHtml = `
            <div id="tw_auto_action_status_bar" style="
                background-color: rgba(0,0,0,0.7);
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                font-size: 12px;
                text-align: left;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                box-sizing: border-box;
                flex-grow: 1;
                min-width: 50px;
            ">
                TW Auto-Action ist bereit.
            </div>
        `;

        // Haupt-Container für Buttons und Statusleiste
        // Wichtig: 'margin-top' und 'margin-bottom' anpassen, damit genug Platz ist und es nicht "klebt"
        const mainContainerHtml = `
            <div id="tw_auto_action_main_container" style="
                display: flex;
                justify-content: flex-start;
                align-items: center;
                gap: 10px;
                margin-top: 15px; /* Abstand nach oben */
                margin-bottom: 15px; /* Abstand nach unten */
                width: 100%;
                box-sizing: border-box;
            ">
                ${toggleButtonHtml}
                ${settingsButtonHtml}
                ${statusBarHtml}
            </div>
        `;

        // Einfügen des Containers
        targetElement.before(mainContainerHtml);

        // Referenzen holen
        mainContainerRef = $('#tw_auto_action_main_container');
        toggleButtonRef = mainContainerRef.find('#tw_auto_action_toggle_button');
        settingsButtonRef = mainContainerRef.find('#tw_auto_action_settings_button');
        statusBarRef = mainContainerRef.find('#tw_auto_action_status_bar');

        if (settingsButtonRef.length > 0) {
            settingsButtonRef.on('click', (e) => {
                e.preventDefault();
                openSettingsDialog();
            });
        }

        if (toggleButtonRef.length > 0) {
            toggleButtonRef.on('click', (e) => {
                e.preventDefault();
                window.toggleTribalAutoAction();
            });
        }

        updateUIStatus();
    }

    // --- Skript-Initialisierung ---
    loadSettings();

    // jQuery bereit? Falls nicht, warte und versuche es erneut
    function initializeScript() {
        if (typeof $ === 'undefined') {
            console.log('TW Auto-Action: jQuery noch nicht geladen, warte 100ms...');
            setTimeout(initializeScript, 100);
            return;
        }

        $(document).ready(function() {
            addAmFarmSettingsButton();

            if (!initialReadyMessageShown && typeof UI !== 'undefined' && typeof UI.InfoMessage === 'function') {
                setTimeout(() => {
                    let hotkeyDisplay = currentSettings.toggleKeyChar;
                    if (currentSettings.requiredCtrl) hotkeyDisplay = 'Strg + ' + hotkeyDisplay;
                    if (currentSettings.requiredAlt) hotkeyDisplay = 'Alt + ' + hotkeyDisplay;
                    if (currentSettings.requiredShift) hotkeyDisplay = 'Shift + ' + hotkeyDisplay;
                    hotkeyDisplay = hotkeyDisplay.replace(/\s\+\s$/, '');

                    UI.InfoMessage('TW Auto-Action (v' + SCRIPT_VERSION + ') ist bereit. Starte per Hotkey: ' + hotkeyDisplay + ' oder über den "Start/Stopp"-Button.', 3000);
                    initialReadyMessageShown = true;
                }, 1000);
            }

            const observerConfig = { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] };

            const observer = new MutationObserver((mutationsList, observer) => {
                if (autoActionActive || botProtectionDetected || noFarmButtonsDetected || !initialReadyMessageShown) {
                    const relevantChange = mutationsList.some(mutation =>
                        mutation.type === 'childList' ||
                        (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
                    );

                    if (relevantChange) {
                        const botProtectionFound = checkAntiBotProtection();

                        if (!botProtectionFound && typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
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
                        } else if (!botProtectionFound) {
                            if (noFarmButtonsDetected || botProtectionDetected) {
                                noFarmButtonsDetected = false;
                                botProtectionDetected = false;
                                updateUIStatus();
                            }
                        }
                    }
                }
            });

            observer.observe(document.body, observerConfig);

            checkAntiBotProtection();
            if (typeof game_data !== 'undefined' && game_data.screen === 'am_farm') {
                const farmButton = $(FARM_BUTTON_SELECTOR).first();
                if (farmButton.length === 0 || !farmButton.is(':visible') || farmButton.is(':disabled')) {
                    noFarmButtonsDetected = true;
                }
            }
            updateUIStatus();
        });
    }

    // Starte die Initialisierung
    initializeScript();

})();
