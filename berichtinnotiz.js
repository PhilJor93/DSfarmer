// Die Stämme - Reports Script
// Version: 2.1
// Autor: xdam98
// Dieses Script wird über die Schnellleiste ausgeführt und erstellt automatisch Notizen aus Berichten.

(function() {
    'use strict';
    
    // Script configuration
    const ScriptData = {
        name: "Auto notes from report",
        version: "v2.1",
        lastUpdate: "2021-03-07", 
        author: "xdam98",
        authorContact: "Xico#7941 (Discord)"
    };

    const LS_prefix = "xd";

    // Multi-language translations (German and English only)
    const translations = {
        de_DE: {
            unknown: "Unbekannt",
            verifyReportPage: "Dieses Script kann nur auf einer Berichtsseite ausgeführt werden.",
            offensive: "Offensiv",
            defensive: "Defensiv",
            probOffensive: "Wahrscheinlich Offensiv",
            probDefensive: "Wahrscheinlich Defensiv",
            noSurvivors: "Keine Truppen überlebt",
            watchtower: "Wachturm",
            wall: "Wall",
            firstChurch: "Erste Kirche",
            church: "Kirche",
            defensiveNukes: "Defensive Vollausbauten",
            noteCreated: "Notiz erstellt",
            addReportTo: "Bericht zu welchem Dorf hinzufügen:"
        },
        en_DK: {
            unknown: "Unknown",
            verifyReportPage: "This script can only be run on a report screen.",
            offensive: "Offensive",
            defensive: "Defensive",
            probOffensive: "Probably Offensive",
            probDefensive: "Probably Defensive",
            noSurvivors: "No troops survived",
            watchtower: "Watchtower",
            wall: "Wall",
            firstChurch: "First church",
            church: "Church",
            defensiveNukes: "defensive nukes",
            noteCreated: "Note created",
            addReportTo: "Add report to which village:"
        },
        en_US: {
            unknown: "Unknown",
            verifyReportPage: "This script can only be run on a report screen.",
            offensive: "Offensive",
            defensive: "Defensive",
            probOffensive: "Probably Offensive",
            probDefensive: "Probably Defensive",
            noSurvivors: "No troops survived",
            watchtower: "Watchtower",
            wall: "Wall",
            firstChurch: "First church",
            church: "Church",
            defensiveNukes: "defensive nukes",
            noteCreated: "Note created",
            addReportTo: "Add report to which village:"
        }
    };

    // Translation helper function
    const _t = (key) => translations[game_data.locale]?.[key] || translations.de_DE[key];

    // Initialize translations
    const initTranslations = () => {
        if (localStorage.getItem(`${LS_prefix}_langWarning`)) return 1;
        if (!translations[game_data.locale]) {
            UI.ErrorMessage(`No translation found for <b>${game_data.locale}</b>.`, 3000);
        }
        localStorage.setItem(`${LS_prefix}_langWarning`, 1);
        return 0;
    };

/**
 * Main Report Notes Creator Object
 */
const CriarRelatorioNotas = {
    /**
     * Data structure to store all report information
     */
    dados: {
        player: {
            nomePlayer: game_data.player.name,
            playerEstaAtacar: false,
            playerEstaDefender: false,
            playerQuerInfoAtacante: false,
            playerQuerInfoDefensor: false
        },
        aldeia: {
            ofensiva: {
                idAldeia: "-1",
                tipoAldeia: _t("unknown"),
                tropas: {
                    totais: [],
                    ofensivas: 0,
                    defensivas: 0
                }
            },
            defensiva: {
                idAldeia: "-1",
                tipoAldeia: _t("unknown"),
                tropas: {
                    visiveis: false,
                    totais: [],
                    fora: {
                        visiveis: false,
                        ofensivas: 0,
                        defensivas: 0,
                        totais: []
                    },
                    dentro: {
                        ofensivas: 0,
                        defensivas: 0,
                        totais: []
                    },
                    apoios: 0
                },
                edificios: {
                    edificiosVisiveis: false,
                    torre: [false, 0],
                    igrejaPrincipal: [false, 0],
                    igreja: [false, 0],
                    muralha: [false, 0]
                }
            }
        },
        mundo: {
            fazendaPorTropa: [],
            arqueirosAtivos: false
        }
    },

    /**
     * Script configurations
     */
    configs: {
        esconderTropas: false
    },

    /**
     * Verify if we're on a report page
     * @returns {boolean} True if on report page
     */
    verificarPagina: function() {
        const matches = window.location.href.match(/(screen\=report){1}|(view\=){1}\w+/g);
        
        if (!matches || matches.length !== 2) {
            UI.ErrorMessage(_t("verifyReportPage"), 5000);
            return false;
        }
        
        return true;
    },

    /**
     * Initialize script configurations
     */
    initConfigs: function() {
        this.configs.esconderTropas = this.loadLSConfig("esconderTropas", false);
    },

    /**
     * Load configuration from localStorage
     * @param {string} key - Configuration key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Configuration value
     */
    loadLSConfig: (key, defaultValue) => {
        return localStorage.getItem(`${LS_prefix}_${key}`) ?? defaultValue;
    },
    // Main script methods
    start: function() {
        if (this.verificarPagina()) {
            this.initDadosScript();
            this.getTipoAldeia();
            this.escreveNota();
        }
    }
};

// Initialize and start the script
if (initTranslations()) {
    CriarRelatorioNotas.start();
} else {
    setTimeout(() => {
        CriarRelatorioNotas.start();
    }, 3000);
}

// Usage tracking
$.getJSON("https://api.countapi.xyz/hit/xdamScripts/scriptCriarNotaRelatorio");

})();



