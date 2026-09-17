// Références aux éléments de la popup
const passInput = document.getElementById('passphrase');
const setBtn = document.getElementById('setKey');
const clearBtn = document.getElementById('clearKey');
const toggleBtn = document.getElementById('toggleKey');
const statusDiv = document.getElementById('status');
const generateBtn = document.getElementById('generatePassword');
const site = document.getElementById('site');
const passwordResult = document.getElementById('passwordResult');
const passwordSecurity = document.getElementById('passwordSecurity');
const error = document.getElementById('error');
const siteContainer = document.getElementById('siteContainer');
const passwordResultContainer = document.getElementById('passwordResultContainer');
const passwordSecurityContainer = document.getElementById('passwordSecurityContainer');
const errorContainer = document.getElementById('errorContainer');

const lengthInput = document.getElementById('length');
// Bornes lues sur le champ lui-même, pour ne pas les redéclarer ici en plus
// du HTML et du background (qui reste l'autorité : il borne ce qu'on envoie).
const MIN_LENGTH = parseInt(lengthInput.min, 10);
const MAX_LENGTH = parseInt(lengthInput.max, 10);
const minInput = document.getElementById('lowercase');
const majInput = document.getElementById('uppercase');
const symInput = document.getElementById('symbols');
const chiInput = document.getElementById('numbers');

if (typeof browser === "undefined") {
    var browser = chrome;
}

// Chargement des paramètres sauvegardés
window.addEventListener('DOMContentLoaded', () => {
    hideResult();
    hideError();
    browser.runtime.sendMessage({ action: 'checkEncodingKey' }, (resp) => {
        if (resp && resp.hasEncodingKey) {
            statusDiv.style.color = 'green';
            statusDiv.textContent = 'Clef définie.';
            browser.runtime.sendMessage({ action: 'getEncodingKey' }, (resp) => {
                passInput.value = resp.encodingKey;
            })
        }
    });

    // Les paramètres sont lus depuis le background, seul détenteur de la
    // source de vérité (browser.storage.local) : la popup ne fait que les
    // afficher et les renvoyer quand l'utilisateur les modifie.
    browser.runtime.sendMessage({ action: 'getParams' }, (resp) => {
        applyParams((resp && resp.params) || {});
    });
});

function applyParams(params) {
    if (params.lengthNumber !== undefined) lengthInput.value = params.lengthNumber;
    if (params.minState !== undefined) minInput.checked = params.minState;
    if (params.majState !== undefined) majInput.checked = params.majState;
    if (params.symState !== undefined) symInput.checked = params.symState;
    if (params.chiState !== undefined) chiInput.checked = params.chiState;
}

/// Enregistre les paramètres (le background les persiste et les renvoie
/// normalisés / bornés), puis régénère l'aperçu si une clef est disponible.
function updateParams(options) {
    browser.runtime.sendMessage({ action: 'setParams', data: options }, (resp) => {
        if (!resp || !resp.ok) {
            statusDiv.style.color = 'red';
            statusDiv.textContent = 'Erreur: ' + ((resp && resp.error) || 'n/a');
            return;
        }
        // Reflète la valeur réellement retenue (ex. 99 saisi → borné à 40).
        applyParams(resp.params);
        if (passInput.value) {
            generatePassword();
        }
    });
}

function getParams() {
    return {
        lengthNumber: lengthInput.value,
        minState: minInput.checked,
        majState: majInput.checked,
        symState: symInput.checked,
        chiState: chiInput.checked,
    };
}


[minInput, majInput, symInput, chiInput].forEach(input => {
    input.addEventListener('change', () => updateParams(getParams()));
});

// Pour la longueur on écoute `input` (et non `change`) : le réglage est
// enregistré dès la frappe, sans attendre que le champ perde le focus — la
// popup peut être fermée juste après. On n'enregistre qu'une valeur déjà dans
// les bornes, sinon une saisie intermédiaire (« 3 » en tapant « 30 ») serait
// persistée puis ramenée à 4.
lengthInput.addEventListener('input', () => {
    const n = parseInt(lengthInput.value, 10);
    if (!Number.isNaN(n) && n >= MIN_LENGTH && n <= MAX_LENGTH) {
        updateParams(getParams());
    }
});
// Filet de sécurité à la sortie du champ : une valeur hors bornes ou vide est
// renvoyée au background, qui la borne et nous retourne la valeur retenue.
lengthInput.addEventListener('blur', () => updateParams(getParams()));

// Afficher / masquer la clef
toggleBtn.addEventListener('click', () => {
    const isHidden = passInput.type === 'password';
    passInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? 'Cacher' : 'Voir';
    toggleBtn.setAttribute('aria-pressed', String(isHidden));
});

// Définir la clef
setBtn.addEventListener('click', () => {
    setPassword();
});


// Déclenche setPassword() si on appuie sur "Entrée" dans passInput
passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        setPassword();
    }
});

function setPassword() {
    const pass = passInput.value.trim();
    if (!pass) {
        return;
    }

    statusDiv.style.color = 'black';
    statusDiv.textContent = 'Dérivation en cours...';
    
    browser.runtime.sendMessage({ action: 'setEncodingKey', encodingKey: pass }, (resp) => {
        if (resp && resp.ok) {
            statusDiv.style.color = 'green';
            statusDiv.textContent = 'Clef définie.';
            generatePassword();
        } else {
            statusDiv.style.color = 'red';
            statusDiv.textContent = 'Erreur: ' + (resp && resp.error || 'n/a');
        }
    });
}

// Effacer la clef
clearBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'clearEncodingKey' }, (resp) => {
        if (resp && resp.ok) {
            statusDiv.style.color = 'black';
            statusDiv.textContent = 'Clef effacée.';
            passInput.value = '';
            hideResult();
            hideError();
        }
    });
});

// Copier le mot de passe
document.getElementById('copyPasswordBtn').addEventListener('click', () => {
    const pwd = document.getElementById('passwordResult').textContent;
    if (pwd) {
        navigator.clipboard.writeText(pwd).then(() => {
        });
    }
});

// Générer un mot de passe pour l'onglet actif avec les paramètres avancés
generateBtn.addEventListener('click', () => {
    generatePassword();
});

function generatePassword() {
    // Aucune option n'est transmise : le background relit les paramètres
    // persistés, exactement comme pour le menu injecté dans la page. C'est ce
    // qui garantit un mot de passe identique des deux côtés.
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) return;
        const tab = tabs[0];

        // Envoi du message au background pour générer le mot de passe
        browser.runtime.sendMessage(
            {
                action: 'generatePassword',
                url: tab.url
            },
            (response) => {
                if (response.error) {
                    hideResult();
                    showError();
                    error.style.display = 'block';
                    error.textContent = response.error;
                } else if (response.password) {
                    hideError();
                    showResult();
                    site.textContent = response.site;
                    passwordResult.textContent = response.password;
                    passwordSecurity.style.color = response.color;
                    passwordSecurity.textContent = `${response.security} (${response.bits} bits)`;
                } else {
                    hideResult();
                    showError();
                    error.style.display = 'block';
                    error.textContent = 'Pas de réponse.';
                }
            }
        );
    });
}

function hideError() {
    errorContainer.style.display = 'none';
    error.textContent = '';
}

function showError() {
    errorContainer.style.display = 'block';
}

function hideResult() {
    siteContainer.style.display = 'none';
    site.textContent = '';
    passwordResultContainer.style.display = 'none';
    passwordResult.textContent = '';
    passwordSecurityContainer.style.display = 'none';
    passwordSecurity.textContent = '';
}

function showResult() {
    siteContainer.style.display = 'block';
    passwordResultContainer.style.display = 'block';
    passwordSecurityContainer.style.display = 'block';
}
