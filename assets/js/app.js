// Importation des modules Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    deleteUser,
    updatePassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    collection, 
    query, 
    where, 
    onSnapshot,
    getDocs,
    deleteDoc,
    setLogLevel,
    updateDoc,
    writeBatch,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// SDK pour le stockage de fichiers (photos, etc.) - Futur
/*
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
*/

// --- Configuration Firebase ---
// REMPLACEZ PAR VOTRE PROPRE CONFIGURATION FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyCJ3aNGOtir7Tank7Lxm5NEjUvHpsowOtE",
  authDomain: "pour-mich.firebaseapp.com",
  projectId: "pour-mich",
  storageBucket: "pour-mich.firebasestorage.app",
  messagingSenderId: "304617036411",
  appId: "1:304617036411:web:7cd6b421e3bd32f78d60de",
  measurementId: "G-5PBQJN1DVR"
};
// --- FIN DE LA CONFIGURATION ---

const appId = 'gest-appareils-public'; // Nom de la collection principale
const DEEP_LINK_STORAGE_KEY = 'gestapp:pendingDeepLink';

// --- Variables Globales ---
let app, auth, db, storage;
let secondaryApp = null;
let secondaryAuth = null;
let currentUserId = null;
let currentUserRole = null; // 'admin', 'user', ou 'new'
let currentUserProfile = null;
let isAuthReady = false;

// Collections Firestore
let usersCollection, storesCollection, equipmentCollection, formsCollection, reportsCollection, equipmentTypesCollection;

// Etat de l'application (Cache local)
let html5QrCode;
let currentScannedData = null;
let pendingDeepLink = null;
let allStores = [];
let allEquipment = [];
let allForms = [];
let allReports = [];
let allEquipmentTypes = [];
let equipmentListenerReady = false; // Flag pour gérer le chargement
let storesLoaded = false;
let formsLoaded = false;
let selectedEquipmentIds = new Set(); // NOUVEAU: Pour la sélection multiple
let storeSearchTerm = '';
let openStoreIds = new Set();
let reportSearchTerm = '';
let openReportStoreIds = new Set();
let allUsers = [];
let userSearchTerm = '';
let reportFilterStoreIds = [];
let reportFilterUserIds = [];
let reportFilterFormIds = [];
let reportFilterFrom = '';
let reportFilterTo = '';
let analyticsFilterStoreIds = [];
let analyticsFilterUserIds = [];
let analyticsFilterFormIds = [];
let analyticsFilterTypeKeys = [];
let analyticsFilterFrom = '';
let analyticsFilterTo = '';
let excelFilterStoreIds = [];
let excelFilterUserIds = [];
let excelFilterFormIds = [];
let excelFilterFrom = '';
let excelFilterTo = '';
let userFilterRoles = [];
let userFilterFunctions = [];
let userFilterStatuses = [];
let isCreateUserFormOpen = false;
let currentBulkQrData = [];
let messageTimeoutId = null;
let messageActionHandler = null;

const multiSelectInstances = new Map();
const analyticsCharts = {};

const MULTI_SELECT_CONFIG = {
    'report-filter-store': { placeholder: 'Tous les magasins' },
    'report-filter-user': { placeholder: 'Tous les intervenants' },
    'report-filter-form': { placeholder: 'Tous les formulaires' },
    'excel-filter-store': { placeholder: 'Tous les magasins' },
    'excel-filter-user': { placeholder: 'Tous les intervenants' },
    'excel-filter-form': { placeholder: 'Tous les formulaires' },
    'analytics-filter-store': { placeholder: 'Tous les magasins' },
    'analytics-filter-user': { placeholder: 'Tous les utilisateurs' },
    'analytics-filter-form': { placeholder: 'Tous les formulaires' },
    'analytics-filter-type': { placeholder: 'Tous les types' },
    'user-filter-role': { placeholder: 'Tous les rôles' },
    'user-filter-function': { placeholder: 'Toutes les fonctions' },
    'user-filter-status': { placeholder: 'Tous les statuts' }
};

const DATE_PRESETS = {
    today: () => ({ from: formatDateInput(new Date()), to: formatDateInput(new Date()) }),
    yesterday: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return { from: formatDateInput(d), to: formatDateInput(d) };
    },
    thisWeek: () => {
        const now = new Date();
        const start = startOfWeek(now);
        const end = endOfWeek(now);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    lastWeek: () => {
        const now = new Date();
        now.setDate(now.getDate() - 7);
        const start = startOfWeek(now);
        const end = endOfWeek(now);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    lastMonth: () => {
        const start = startOfMonth(shiftMonth(new Date(), -1));
        const end = endOfMonth(start);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    last3Months: () => {
        const end = new Date();
        const start = shiftMonth(new Date(), -3);
        start.setDate(1);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    last6Months: () => {
        const end = new Date();
        const start = shiftMonth(new Date(), -6);
        start.setDate(1);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    thisYear: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    last365: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 364);
        return { from: formatDateInput(start), to: formatDateInput(end) };
    },
    all: () => ({ from: '', to: '' })
};

captureDeepLinkFromUrl();

// Listeners (pour les arrêter)
let unsubForms = () => {}, unsubStores = () => {}, unsubEquipment = () => {}, unsubReports = () => {}, unsubUsers = () => {}, unsubEquipmentTypes = () => {};

// Callback pour la modal de confirmation
let _confirmCallback = null; 

// Modèles de types d'appareils
const equipmentTypeModels = {
    "Chauffage": "🔥", "Climatisation": "❄️", "Ventilation": "🌬️", "Électricité": "⚡",
    "Plomberie": "💧", "Sécurité": "🛡️", "Incendie": " extinguisher", "Ascenseur": "↕️",
    "Porte Auto": "🚪", "Froid": "🧊", "Cuisine": "🍳", "Lumière": "💡",
    "Extincteur": "🧯", "Caméra": "📷", "Alarme": "🚨"
};

// Fonction utilitaire pour récupérer un élément (évite les répétitions)
function getEl(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Élément introuvable: #${id}.`);
    }
    return el;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDisplayName(profile) {
    if (!profile) return '';
    return [profile.firstName, profile.lastName]
        .filter(part => part && part.trim().length > 0)
        .join(' ')
        .trim();
}

function getFirstName(profile) {
    if (!profile) return '';
    if (profile.firstName && profile.firstName.trim().length > 0) {
        return profile.firstName.trim();
    }
    if (profile.displayName && profile.displayName.trim().length > 0) {
        return profile.displayName.trim().split(' ')[0];
    }
    return '';
}

function formatDateInput(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = (day + 6) % 7; // Lundi = 0
    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

function endOfWeek(date) {
    const result = startOfWeek(date);
    result.setDate(result.getDate() + 6);
    result.setHours(23, 59, 59, 999);
    return result;
}

function startOfMonth(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), 1);
    result.setHours(0, 0, 0, 0);
    return result;
}

function endOfMonth(date) {
    const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    result.setHours(23, 59, 59, 999);
    return result;
}

function shiftMonth(date, delta) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + delta);
    return result;
}

function initializeMultiSelectControls() {
    Object.keys(MULTI_SELECT_CONFIG).forEach(id => ensureMultiSelect(id));
}

function ensureMultiSelect(id) {
    if (typeof Choices === 'undefined') return null;
    const element = getEl(id);
    if (!element) return null;
    if (!element.hasAttribute('multiple')) {
        element.setAttribute('multiple', 'multiple');
    }
    if (!multiSelectInstances.has(id)) {
        const config = MULTI_SELECT_CONFIG[id] || {};
        const instance = new Choices(element, {
            removeItemButton: true,
            searchResultLimit: 10,
            searchPlaceholderValue: 'Rechercher...',
            placeholder: true,
            placeholderValue: config.placeholder || '',
            shouldSort: false,
            itemSelectText: ''
        });
        multiSelectInstances.set(id, instance);
    }
    element.dataset.choicesActive = 'true';
    return multiSelectInstances.get(id);
}

function setMultiSelectOptions(id, options = [], selectedValues = []) {
    const instance = ensureMultiSelect(id);
    const element = getEl(id);
    if (!instance || !element) return Array.isArray(selectedValues) ? [...selectedValues] : [];

    const sanitized = Array.isArray(selectedValues)
        ? selectedValues.filter(value => options.some(opt => opt.value === value))
        : [];

    instance.clearChoices();
    instance.setChoices(options.map(opt => ({ value: opt.value, label: opt.label })), 'value', 'label', true);
    instance.removeActiveItems();
    if (sanitized.length) {
        instance.setChoiceByValue(sanitized);
    }

    return sanitized;
}

function syncMultiSelectSelection(id, values = []) {
    const instance = ensureMultiSelect(id);
    if (!instance) return;
    instance.removeActiveItems();
    if (values.length) {
        instance.setChoiceByValue(values);
    }
}

function getMultiSelectSelectedValues(id) {
    const instance = multiSelectInstances.get(id);
    if (instance) {
        const raw = instance.getValue(true);
        if (Array.isArray(raw)) {
            return raw.filter(Boolean);
        }
        return raw ? [raw] : [];
    }
    const element = getEl(id);
    if (!element) return [];
    return Array.from(element.selectedOptions || [])
        .map(opt => opt.value)
        .filter(value => value && value.length > 0);
}

function clearMultiSelect(id) {
    const instance = multiSelectInstances.get(id);
    if (instance) {
        instance.removeActiveItems();
        return;
    }
    const element = getEl(id);
    if (element) {
        Array.from(element.options).forEach(option => option.selected = false);
    }
}

function setupDatePresetControls(containerId, onApply) {
    const container = typeof containerId === 'string' ? getEl(containerId) : containerId;
    if (!container) return;
    container.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-range]');
        if (!button) return;
        const presetKey = button.dataset.range;
        const rangeGenerator = DATE_PRESETS[presetKey] || DATE_PRESETS.all;
        const range = rangeGenerator();

        const fromInputId = container.dataset.targetFrom;
        const toInputId = container.dataset.targetTo;
        if (fromInputId) {
            const fromInput = getEl(fromInputId);
            if (fromInput) {
                fromInput.value = range.from || '';
            }
        }
        if (toInputId) {
            const toInput = getEl(toInputId);
            if (toInput) {
                toInput.value = range.to || '';
            }
        }

        if (typeof onApply === 'function') {
            onApply(range.from || '', range.to || '', presetKey);
        }
    });
}

function getFormTypeKey(form) {
    if (!form) return 'autre';
    const raw = form.type || form.category || form.title || 'Autre';
    return raw.toLowerCase();
}

function getFormTypeLabel(form) {
    if (!form) return 'Autre';
    return form.type || form.category || form.title || 'Autre';
}

function normalizeTimestamp(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value.seconds === 'number') {
        return new Date(value.seconds * 1000);
    }
    return null;
}

function applyAlphaToColor(color, alpha = 0.2) {
    if (!color) {
        return `rgba(0,0,0,${alpha})`;
    }

    const normalizedAlpha = Math.min(Math.max(alpha, 0), 1);
    if (color.startsWith('#')) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(ch => ch + ch).join('');
        }
        if (hex.length !== 6) {
            return color;
        }
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    if (color.startsWith('rgb(')) {
        return color.replace('rgb', 'rgba').replace(')', `, ${normalizedAlpha})`);
    }

    return color;
}

function formatRoleLabel(role) {
    switch ((role || 'user').toLowerCase()) {
        case 'admin':
            return 'Administrateur';
        case 'new':
            return 'En attente';
        case 'user':
        default:
            return 'Utilisateur';
    }
}

function getUserStatusKey(user = {}) {
    if (user.status) return user.status;
    if (user.mustChangePassword) return 'pending-password';
    return 'active';
}

function getUserStatusLabel(key) {
    switch ((key || 'active').toLowerCase()) {
        case 'pending':
            return 'En attente';
        case 'invited':
            return 'Invité';
        case 'pending-password':
            return 'MDP à changer';
        case 'active':
        default:
            return 'Actif';
    }
}

function updateWelcomeMessage() {
    // MODIFIÉ: Mettre à jour les panneaux utilisateur
    const welcomeDisplay = getEl('user-welcome-display'); // Ancien (caché)
    const welcomeDisplayNav = getEl('user-welcome-display-nav'); // Nouveau (dans la nav)
    const mobileWelcome = getEl('mobile-user-name');
    const mobileEmail = getEl('mobile-user-email');
    const navMobileGreeting = getEl('nav-mobile-greeting');
    const mobileHero = getEl('mobile-main-welcome');

    const firstName = getFirstName(currentUserProfile);
    const fullName = getDisplayName(currentUserProfile);
    const baseEmail = currentUserProfile?.email || auth?.currentUser?.email || '';

    const message = firstName
        ? `Bienvenue ${firstName}`
        : (fullName ? `Bienvenue ${fullName}` : (baseEmail ? `Bienvenue ${baseEmail}` : ''));

    if (welcomeDisplay && welcomeDisplayNav) {
        if (message) {
            welcomeDisplay.textContent = message;
            welcomeDisplayNav.textContent = message;
            welcomeDisplay.classList.remove('hidden');
            welcomeDisplayNav.classList.remove('hidden');
        } else {
            welcomeDisplay.textContent = '';
            welcomeDisplayNav.textContent = '';
            welcomeDisplay.classList.add('hidden');
            welcomeDisplayNav.classList.add('hidden');
        }
    }

    if (mobileWelcome) {
        mobileWelcome.textContent = message;
    }
    if (mobileEmail) {
        mobileEmail.textContent = baseEmail;
    }
    if (navMobileGreeting) {
        navMobileGreeting.textContent = message;
    }
    if (mobileHero) {
        mobileHero.textContent = message || 'Bienvenue';
    }

    const mobileRoleDisplay = getEl('mobile-role-display');
    if (mobileRoleDisplay) {
        if (currentUserRole) {
            const roleLabel = currentUserRole === 'admin' ? 'ADMINISTRATEUR' : (currentUserRole === 'user' ? 'UTILISATEUR' : 'EN ATTENTE');
            mobileRoleDisplay.textContent = roleLabel;
            mobileRoleDisplay.classList.remove('hidden');
        } else {
            mobileRoleDisplay.textContent = '';
            mobileRoleDisplay.classList.add('hidden');
        }
    }

    syncMobileAccountForm();
}

function syncMobileAccountForm() {
    const firstNameInput = getEl('mobile-account-first-name');
    const lastNameInput = getEl('mobile-account-last-name');
    const fonctionInput = getEl('mobile-account-fonction');
    const emailInput = getEl('mobile-account-email');

    if (!firstNameInput || !lastNameInput || !fonctionInput || !emailInput) return;

    firstNameInput.value = currentUserProfile?.firstName || '';
    lastNameInput.value = currentUserProfile?.lastName || '';
    fonctionInput.value = currentUserProfile?.fonction || '';
    emailInput.value = currentUserProfile?.email || auth?.currentUser?.email || '';
}

function captureDeepLinkFromUrl() {
    if (typeof window === 'undefined') return;
    try {
        const params = new URLSearchParams(window.location.search);
        const dataFromUrl = extractDataFromSearchParams(params);

        if (dataFromUrl) {
            pendingDeepLink = dataFromUrl;
            sessionStorage.setItem(DEEP_LINK_STORAGE_KEY, JSON.stringify(dataFromUrl));
            const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
            window.history.replaceState({}, document.title, cleanUrl);
            return;
        }

        const stored = sessionStorage.getItem(DEEP_LINK_STORAGE_KEY);
        if (stored) {
            pendingDeepLink = JSON.parse(stored);
        }
    } catch (error) {
        console.warn('Impossible de lire le lien profond:', error);
    }
}

function extractDataFromSearchParams(params) {
    if (!params) return null;
    const storeId = params.get('store') || params.get('storeId');
    const equipmentId = params.get('equip') || params.get('equipment') || params.get('equipmentId');
    const formId = params.get('form') || params.get('formId');

    if (storeId && equipmentId && formId) {
        return { storeId, equipmentId, formId };
    }
    return null;
}

function clearPendingDeepLink() {
    pendingDeepLink = null;
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY);
    }
}

function processPendingDeepLink({ forceMessage = false } = {}) {
    if (!pendingDeepLink || !isAuthReady || !currentUserId) return;
    const opened = openInterventionFormFor(pendingDeepLink, { silent: !forceMessage });
    if (opened) {
        clearPendingDeepLink();
    } else if (forceMessage) {
        clearPendingDeepLink();
    }
}

function parseQrPayload(rawText) {
    if (!rawText) return null;
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    try {
        const data = JSON.parse(trimmed);
        if (data.storeId && data.equipmentId && data.formId) {
            return data;
        }
    } catch (error) {
        // Ignorer, ce n'est simplement pas du JSON
    }

    return extractDataFromUrlText(trimmed);
}

function extractDataFromUrlText(text) {
    try {
        const url = new URL(text);
        const data = extractDataFromSearchParams(url.searchParams);
        if (data) return data;
    } catch (error) {
        // Ignorer
    }

    if (text.includes('=') || text.includes('&')) {
        try {
            const normalized = text.startsWith('?') ? text : `?${text}`;
            const params = new URLSearchParams(normalized);
            return extractDataFromSearchParams(params);
        } catch (error) {
            return null;
        }
    }

    return null;
}

function buildDeepLinkUrl(data) {
    if (typeof window === 'undefined') return '';
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = new URL(baseUrl);
    url.searchParams.set('store', data.storeId);
    url.searchParams.set('equip', data.equipmentId);
    url.searchParams.set('form', data.formId);
    return url.toString();
}

function openInterventionFormFor(data, { silent = false } = {}) {
    if (!data || !data.storeId || !data.equipmentId || !data.formId) {
        if (!silent) {
            showMessage('QR code non valide ou incomplet.', 'error');
        }
        return false;
    }

    const store = allStores.find(s => s.id === data.storeId);
    const equipment = allEquipment.find(eq => eq.id === data.equipmentId);
    const form = allForms.find(f => f.id === data.formId);

    if (!store || !equipment || !form) {
        if (!silent && isAuthReady) {
            showMessage('QR code non valide ou données introuvables.', 'error');
        }
        return false;
    }

    currentScannedData = {
        storeId: data.storeId,
        equipmentId: data.equipmentId,
        formId: data.formId
    };

    const storeLabel = store.name || 'Magasin';
    const equipmentLabel = equipment.name || 'Appareil';
    getEl('form-subtitle').textContent = `Magasin: ${storeLabel} • Appareil: ${equipmentLabel}`;
    getEl('form-datetime').value = new Date().toLocaleString('fr-FR');

    renderInterventionForm(data.formId);
    navigateTo('intervention-form');
    return true;
}

function triggerDeepLinkCheck() {
    const readyForError = formsLoaded && storesLoaded && equipmentListenerReady;
    processPendingDeepLink({ forceMessage: readyForError });
}

function setCreateUserFormVisibility(shouldShow) {
    const form = getEl('create-user-form');
    const toggleBtn = getEl('toggle-create-user-form');
    if (!form || !toggleBtn) return;

    isCreateUserFormOpen = shouldShow;

    if (shouldShow) {
        form.classList.remove('hidden');
        toggleBtn.textContent = 'Fermer';
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-gray');
        const firstNameInput = getEl('create-user-first-name');
        if (firstNameInput) {
            firstNameInput.focus();
        }
    } else {
        form.classList.add('hidden');
        toggleBtn.textContent = 'Créer un utilisateur';
        toggleBtn.classList.remove('btn-gray');
        if (!toggleBtn.classList.contains('btn-primary')) {
            toggleBtn.classList.add('btn-primary');
        }
    }
}

function toggleCreateUserForm() {
    setCreateUserFormVisibility(!isCreateUserFormOpen);
}

function updateReportUserFilter() {
    const sortedUsers = [...allUsers]
        .filter(user => user && user.id)
        .sort((a, b) => {
            const nameA = (getDisplayName(a) || a.email || '').toLowerCase();
            const nameB = (getDisplayName(b) || b.email || '').toLowerCase();
            return nameA.localeCompare(nameB);
        })
        .map(user => {
            let label = getDisplayName(user) || user.email || 'Utilisateur';
            if (user.fonction) {
                label += ` • ${user.fonction}`;
            }
            return { value: user.id, label };
        });

    reportFilterUserIds = setMultiSelectOptions('report-filter-user', sortedUsers, reportFilterUserIds);
    analyticsFilterUserIds = setMultiSelectOptions('analytics-filter-user', sortedUsers, analyticsFilterUserIds);
}

function getSecondaryAuthInstance() {
    if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, 'secondary');
    }
    if (!secondaryAuth) {
        secondaryAuth = getAuth(secondaryApp);
    }
    return secondaryAuth;
}

// --- Initialisation ---

function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        if (!secondaryApp) {
            secondaryApp = initializeApp(firebaseConfig, 'secondary');
            secondaryAuth = getAuth(secondaryApp);
        }
        // storage = getStorage(app); // Futur
        setLogLevel('Debug'); // Pour voir les logs Firestore

        // Définition des chemins de collection "publics"
        const basePath = `artifacts/${appId}/public/data`;
        usersCollection = collection(db, `${basePath}/users`);
        storesCollection = collection(db, `${basePath}/stores`);
        equipmentCollection = collection(db, `${basePath}/equipment`);
        formsCollection = collection(db, `${basePath}/forms`);
        reportsCollection = collection(db, `${basePath}/reports`);
        equipmentTypesCollection = collection(db, `${basePath}/equipmentTypes`);

        setupAuthListener();
        initializeAppEventListeners(); // REFACTOR: Appel de la fonction principale des écouteurs
        populateModelSelect();

    } catch (error) {
        console.error("Erreur d'initialisation Firebase:", error);
        showMessage("Erreur critique d'initialisation.", "error");
    }
}

async function setupAuthListener() {
    // MODIFIÉ: Gérer les deux boutons de déconnexion
    const authButton = getEl('auth-button'); // Ancien
    const authButtonNav = getEl('auth-button-nav'); // Nouveau
    const authButtonMobile = getEl('mobile-logout-btn');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // L'utilisateur est connecté
            currentUserId = user.uid;
            isAuthReady = true;
            console.log("Utilisateur connecté:", currentUserId);

            // Récupérer le rôle de l'utilisateur depuis Firestore
            const userDocRef = doc(usersCollection, user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                currentUserProfile = { id: user.uid, ...userData };
                currentUserRole = userData.role || 'user';

                if (userData.mustChangePassword) {
                    showForcePasswordPage(userData, user.email);
                    return;
                }

                // Gérer les rôles
                if (currentUserRole === 'new') {
                    // Rôle "new" -> Bloquer sur la page d'attente
                    initializeAppUI('new', user.email);
                } else {
                    // Rôle "user" ou "admin"
                    initializeAppUI(currentUserRole, user.email);
                }

            } else {
                // Cas étrange, l'utilisateur est authentifié mais n'a pas de document
                console.error("Erreur: Document utilisateur introuvable pour l'UID:", user.uid);
                showMessage("Erreur de profil, reconnexion...", "error");
                await signOut(auth);
            }

        } else {
            // L'utilisateur est déconnecté
            currentUserId = null;
            currentUserRole = null;
            currentUserProfile = null;
            isAuthReady = false;
            console.log("Utilisateur déconnecté.");

            // Afficher la page de connexion, cacher le reste
            getEl('main-header').classList.add('hidden');
            getEl('main-nav').classList.add('hidden');
            hideAllPages();
            getEl('page-login').classList.remove('hidden');

            // MODIFIÉ: Cacher les infos utilisateur des deux emplacements
            const welcomeDisplay = getEl('user-welcome-display');
            if (welcomeDisplay) welcomeDisplay.classList.add('hidden');
            const roleDisplay = getEl('user-role-display');
            if (roleDisplay) roleDisplay.classList.add('hidden');
            const welcomeDisplayNav = getEl('user-welcome-display-nav');
            if (welcomeDisplayNav) welcomeDisplayNav.classList.add('hidden');
            const roleDisplayNav = getEl('user-role-display-nav');
            if (roleDisplayNav) roleDisplayNav.classList.add('hidden');

            const mobileWelcome = getEl('mobile-user-name');
            if (mobileWelcome) mobileWelcome.textContent = '';
            const mobileEmail = getEl('mobile-user-email');
            if (mobileEmail) mobileEmail.textContent = '';
            const mobileRoleDisplay = getEl('mobile-role-display');
            if (mobileRoleDisplay) mobileRoleDisplay.classList.add('hidden');
            syncMobileAccountForm();
            closeMobileMenu();

            delete document.body.dataset.role;
            allUsers = [];
            userSearchTerm = '';
            reportFilterStoreId = 'all';
            reportFilterUserId = 'all';
            reportFilterFormId = 'all';
            reportFilterFrom = '';
            reportFilterTo = '';
            isCreateUserFormOpen = false;
            updateReportUserFilter();
            setCreateUserFormVisibility(false);
            const userSearchInput = getEl('user-search-input');
            if (userSearchInput) userSearchInput.value = '';
            stopDataListeners(); // Arrêter les écouteurs de données
        }
    });

    // MODIFIÉ: Gérer les deux boutons
    const logoutHandler = () => {
        if (auth.currentUser) {
            signOut(auth);
        }
    };
    if (authButton) authButton.addEventListener('click', logoutHandler);
    if (authButtonNav) authButtonNav.addEventListener('click', logoutHandler);
    if (authButtonMobile) authButtonMobile.addEventListener('click', () => {
        closeMobileMenu();
        logoutHandler();
    });
}

// Affiche l'UI en fonction du rôle
function showForcePasswordPage(userData, email) {
    hideAllPages();
    getEl('main-header').classList.add('hidden');
    getEl('main-nav').classList.add('hidden');

    const emailLabel = getEl('force-reset-email');
    if (emailLabel) emailLabel.textContent = email || '';

    const firstNameInput = getEl('force-first-name');
    if (firstNameInput) firstNameInput.value = userData.firstName || '';

    const lastNameInput = getEl('force-last-name');
    if (lastNameInput) lastNameInput.value = userData.lastName || '';

    const passwordInput = getEl('force-password');
    if (passwordInput) passwordInput.value = '';

    const confirmInput = getEl('force-password-confirm');
    if (confirmInput) confirmInput.value = '';

    getEl('page-password-reset').classList.remove('hidden');
}

function initializeAppUI(role, email) {
    console.log(`Initialisation de l'UI pour: ${email} (Rôle: ${role})`);

    // Cacher la page de connexion
    hideAllPages();

    // Si le rôle est "new", afficher la page d'attente et cacher le header/nav
    if (role === 'new') {
        getEl('page-pending-approval').classList.remove('hidden');
        getEl('main-header').classList.add('hidden');
        getEl('main-nav').classList.add('hidden');
        return; // Arrêter l'initialisation ici
    }

    // Pour "user" et "admin", afficher l'application
    // MODIFICATION UTILISATEUR: Ne plus afficher le main-header
    // getEl('main-header').classList.remove('hidden');
    getEl('main-nav').classList.remove('hidden');

    document.body.dataset.role = role;
    updateWelcomeMessage();

    // MODIFIÉ: Mettre à jour les DEUX badges de rôle
    const roleDisplay = getEl('user-role-display'); // Ancien
    const roleDisplayNav = getEl('user-role-display-nav'); // Nouveau

    if (roleDisplay && roleDisplayNav) {
        const roleLabel = role === 'admin' ? 'ADMINISTRATEUR' : (role === 'user' ? 'UTILISATEUR' : 'EN ATTENTE');
        roleDisplay.textContent = roleLabel;
        roleDisplayNav.textContent = roleLabel;
        roleDisplay.classList.remove('hidden');
        roleDisplayNav.classList.remove('hidden');
    }

    setCreateUserFormVisibility(false);

    // Gérer la visibilité des onglets et des pages
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    if (role === 'admin') {
        adminOnlyElements.forEach(el => el.classList.remove('hidden'));
    } else {
        adminOnlyElements.forEach(el => el.classList.add('hidden'));
    }

    // Démarrer les écouteurs de données
    loadAllData(role);

    // Naviguer vers la page par défaut
    navigateTo('scanner');
    processPendingDeepLink();
}

// --- Chargement des données (Real-time) ---

function stopDataListeners() {
    console.log("Arrêt des listeners...");
    unsubForms();
    unsubStores();
    unsubEquipment();
    unsubReports();
    unsubUsers();
    unsubEquipmentTypes();
}

function loadAllData(role) {
    if (!isAuthReady) {
         console.warn("L'authentification n'est pas prête, chargement annulé.");
         return;
    }

    console.log("Démarrage des listeners de données...");
    stopDataListeners(); // S'assurer que les anciens sont arrêtés
    formsLoaded = false;
    storesLoaded = false;
    equipmentListenerReady = false;

    // 1. Charger les formulaires
    unsubForms = onSnapshot(formsCollection, (snapshot) => {
        allForms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        formsLoaded = true;
        if (role === 'admin') renderFormsList();
        updateAllSelects();
        console.log("Formulaires chargés:", allForms.length);
        triggerDeepLinkCheck();
        if (role === 'admin') {
            updateAnalyticsDashboard();
        }
    }, (error) => console.error("Erreur chargement formulaires:", error));

    // 2. Charger les types d'appareils
     unsubEquipmentTypes = onSnapshot(equipmentTypesCollection, (snapshot) => {
        allEquipmentTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (role === 'admin') renderEquipmentTypesList();
        populateEquipmentTypeSelects();
        console.log("Types d'appareils chargés:", allEquipmentTypes.length);
    }, (error) => console.error("Erreur chargement types appareils:", error));

    // 3. Charger les magasins
    unsubStores = onSnapshot(storesCollection, (snapshot) => {
        allStores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        storesLoaded = true;
        updateAllSelects();
        renderReportsList(); // Mettre à jour les noms de magasins dans les rapports
        console.log("Magasins chargés:", allStores.length);
        if (equipmentListenerReady && role === 'admin') renderStoresList();
        triggerDeepLinkCheck();
        if (role === 'admin') {
            updateAnalyticsDashboard();
        }
    }, (error) => console.error("Erreur chargement magasins:", error));

    // 4. Charger les équipements
    unsubEquipment = onSnapshot(equipmentCollection, (snapshot) => {
        allEquipment = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        equipmentListenerReady = true;
        console.log("Équipements chargés:", allEquipment.length);
        if (role === 'admin') renderStoresList();
        triggerDeepLinkCheck();
    }, (error) => console.error("Erreur chargement équipements:", error));

    // 5. Charger les rapports (Stats)
    unsubReports = onSnapshot(query(reportsCollection), (snapshot) => {
        allReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Trier par date (plus récent en premier)
        allReports.sort((a, b) => {
            const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });
        console.log("Rapports chargés:", allReports.length);
        renderReportsList();
        if (role === 'admin') {
            updateAnalyticsDashboard();
        }
    }, (error) => console.error("Erreur chargement rapports:", error));

    // 6. Charger les utilisateurs (Admin seulement)
    if (role === 'admin') {
        unsubUsers = onSnapshot(usersCollection, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderUsersList(users);
            console.log("Utilisateurs chargés:", users.length);
        }, (error) => console.error("Erreur chargement utilisateurs:", error));
    }
}

// --- Remplissage des Selects (Menus déroulants) ---

function updateAllSelects() {
    const storeSelects = [
        getEl('equip-store-select'),
    ];

    const formSelects = [
        getEl('equip-form-select'),
        getEl('edit-equip-form-select')
    ];

    storeSelects.forEach(sel => {
        if(sel) {
            const previousValue = sel.value;
            const firstOptionValue = sel.options[0] ? sel.options[0].value : "";
            const firstOptionText = sel.options[0] ? sel.options[0].text : "Sélectionnez";

            sel.innerHTML = `<option value="${firstOptionValue}">${firstOptionText}</option>`;

            allStores.slice().sort((a,b) => (a.name || '').localeCompare(b.name || '')).forEach(store => {
                const storeNameLabel = escapeHtml(store.name || 'Magasin');
                const storeCodeLabel = store.code ? ` (${escapeHtml(store.code)})` : '';
                sel.innerHTML += `<option value="${store.id}">${storeNameLabel}${storeCodeLabel}</option>`;
            });

            if (Array.from(sel.options).some(option => option.value === previousValue)) {
                sel.value = previousValue;
            }
        }
    });

    formSelects.forEach(sel => {
         if(sel) {
            const firstOption = sel.options[0] ? sel.options[0].outerHTML : '<option value="">Sélectionnez</option>';
            sel.innerHTML = firstOption;
            allForms.sort((a,b) => a.title.localeCompare(b.title)).forEach(form => {
                sel.innerHTML += `<option value="${form.id}">${form.title}</option>`;
            });
         }
    });

    const storeOptions = allStores.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(store => {
        const code = store.code ? ` (${store.code})` : '';
        return { value: store.id, label: `${store.name || 'Magasin'}${code}` };
    });

    reportFilterStoreIds = setMultiSelectOptions('report-filter-store', storeOptions, reportFilterStoreIds);
    analyticsFilterStoreIds = setMultiSelectOptions('analytics-filter-store', storeOptions, analyticsFilterStoreIds);

    const formOptions = allForms.slice().sort((a, b) => a.title.localeCompare(b.title)).map(form => ({
        value: form.id,
        label: form.title
    }));

    reportFilterFormIds = setMultiSelectOptions('report-filter-form', formOptions, reportFilterFormIds);
    analyticsFilterFormIds = setMultiSelectOptions('analytics-filter-form', formOptions, analyticsFilterFormIds);

    const typeMap = new Map();
    allForms.forEach(form => {
        const key = getFormTypeKey(form);
        const label = getFormTypeLabel(form);
        if (!typeMap.has(key)) {
            typeMap.set(key, label);
        }
    });
    const typeOptions = Array.from(typeMap.entries()).sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }));
    analyticsFilterTypeKeys = setMultiSelectOptions('analytics-filter-type', typeOptions, analyticsFilterTypeKeys);

    updateReportUserFilter();
}

// Remplit les listes déroulantes des types d'appareils
function populateEquipmentTypeSelects() {
    const selects = [
        getEl('equip-type'),
        getEl('edit-equip-type') // Note: Cet ID n'est pas dans le HTML, mais on le garde au cas où
    ];

    let optionsHtml = '<option value="">Sélectionnez un type</option>'; // Ajout d'une option par défaut
    allEquipmentTypes.sort((a,b) => a.label.localeCompare(b.label)).forEach(type => {
        optionsHtml += `<option value="${type.id}">${type.emoji} ${type.label}</option>`;
    });

    selects.forEach(sel => {
        if(sel) sel.innerHTML = optionsHtml;
    });
}

// Remplit la liste des modèles de type d'appareil
function populateModelSelect() {
    const select = getEl('equip-type-model-select');
    if (!select) return;

    const sortedModels = Object.entries(equipmentTypeModels)
                             .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [label, emoji] of sortedModels) {
        select.innerHTML += `<option value="${label},${emoji}">${emoji} ${label}</option>`;
    }
}


// --- Rendu HTML ---

// Rendu de la liste des magasins et de leurs appareils
function renderStoresList() {
    const listContainer = getEl('stores-list');
    if (!listContainer) return;

    const searchInput = getEl('store-search-input');
    if (searchInput && searchInput.value !== storeSearchTerm) {
        searchInput.value = storeSearchTerm;
    }

    if (allStores.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun magasin enregistré pour le moment.</p>';
        return;
    }

    const normalizedTerm = storeSearchTerm.trim().toLowerCase();
    openStoreIds = new Set([...openStoreIds].filter(id => allStores.some(store => store.id === id)));

    const filteredStores = allStores
        .filter(store => {
            if (!normalizedTerm) return true;
            const name = (store.name || '').toLowerCase();
            const code = (store.code || '').toLowerCase();
            return name.includes(normalizedTerm) || code.includes(normalizedTerm);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    if (filteredStores.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun magasin ne correspond à votre recherche.</p>';
        return;
    }

    listContainer.innerHTML = filteredStores.map(store => {
        const equipmentList = allEquipment
            .filter(e => e.storeId === store.id)
            .sort((a, b) => a.name.localeCompare(b.name));

        const hasSearch = normalizedTerm.length > 0;
        const isOpen = hasSearch || openStoreIds.has(store.id);
        const toggleIcon = isOpen ? '&minus;' : '+';
        const equipmentWrapperClasses = `p-4 space-y-3 bg-white ${isOpen ? '' : 'hidden'}`;
        const storeNameSafe = escapeHtml(store.name || 'Magasin');
        const storeCodeSafe = escapeHtml(store.code || '');

        const equipmentsHtml = equipmentList.length > 0
            ? equipmentList.map(equip => {
                const equipType = allEquipmentTypes.find(t => t.id === equip.type);
                const emoji = equipType ? equipType.emoji : '⚙️';
                const isChecked = selectedEquipmentIds.has(equip.id) ? 'checked' : '';
                const equipNameSafe = escapeHtml(equip.name);
                return `
                    <div class="flex justify-between items-center p-3 bg-gray-100 rounded-md">
                        <div class="flex items-center">
                            <input type="checkbox" class="equip-select-checkbox h-5 w-5 rounded mr-3" data-equip-id="${equip.id}" ${isChecked}>
                            <div>
                                <span class="text-2xl mr-2">${emoji}</span>
                                <span class="font-medium">${equipNameSafe}</span>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2 justify-end">
                            <button class="edit-equip-btn text-xs bg-yellow-500 text-white px-2 py-1 rounded-lg hover:bg-yellow-600 font-medium" data-equip-id="${equip.id}">Modifier</button>
                            <button class="delete-equip-btn text-xs btn-danger text-white px-2 py-1 rounded-lg hover:bg-red-600 font-medium" data-equip-id="${equip.id}">Suppr.</button>
                            <button class="generate-qr-btn bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded-lg text-sm hover:bg-gray-50 font-medium"
                                    data-equip-id="${equip.id}"
                                    data-store-id="${store.id}"
                                    data-form-id="${equip.formId}"
                                    data-store-name="${escapeHtml(store.name || '')}"
                                    data-equip-name="${escapeHtml(equip.name || '')}">
                                Générer QR
                            </button>
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="text-sm text-gray-500">Aucun appareil ajouté pour le moment.</p>';

        return `
            <div class="border border-gray-200 rounded-lg overflow-hidden" data-store-id="${store.id}">
                <div class="bg-gray-50 p-4 border-b border-gray-200">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button type="button" class="store-toggle flex-1 text-left" data-store-id="${store.id}">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <h3 class="text-lg font-bold text-primary">${storeNameSafe}</h3>
                                    <p class="text-sm text-gray-500">Code: ${storeCodeSafe || '—'}</p>
                                </div>
                                <div class="flex items-center gap-2 text-sm text-gray-500">
                                    <span>${equipmentList.length} appareil(s)</span>
                                    <span class="text-xl font-bold text-secondary">${toggleIcon}</span>
                                </div>
                            </div>
                        </button>
                        <div class="flex space-x-2">
                            <button class="edit-store-btn text-sm bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 font-medium" data-store-id="${store.id}">Modifier</button>
                            <button class="delete-store-btn text-sm btn-danger text-white px-3 py-1 rounded-lg hover:bg-red-600 font-medium" data-store-id="${store.id}">Supprimer</button>
                        </div>
                    </div>
                </div>
                <div class="${equipmentWrapperClasses}" data-store-equipments="${store.id}">
                    <h4 class="font-semibold text-gray-700">Appareils :</h4>
                    ${equipmentsHtml}
                </div>
            </div>
        `;
    }).join('');
}

// Rendu de la liste des formulaires
function renderFormsList() {
    const listContainer = getEl('forms-list');
     if (!listContainer) return;

    if (allForms.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun formulaire créé pour le moment.</p>';
        return;
    }
    listContainer.innerHTML = allForms
        .sort((a,b) => a.title.localeCompare(b.title)) // Trier par titre
        .map(form => `
        <div class="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-lg font-bold text-primary">${form.title}</h3>
                    <ul class="list-disc list-inside mt-2 text-sm text-gray-600">
                        ${form.fields.map(f => `<li>${f.label} ${f.required ? '(Req.)' : ''} - [${f.type}]</li>`).join('')}
                    </ul>
                </div>
                <div class="flex flex-col sm:flex-row sm:space-x-2 flex-shrink-0">
                     <button class="edit-form-btn text-yellow-600 hover:underline text-sm mt-1" data-form-id="${form.id}">
                        Modifier
                    </button>
                    <button class="delete-form-btn text-danger hover:underline text-sm mt-1" data-form-id="${form.id}">
                        Supprimer
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Rendu de la liste des rapports (Stats)
function renderReportsList() {
    const listContainer = getEl('reports-list');
    const countElement = getEl('reports-count');

    if (!listContainer) return;

    const searchInput = getEl('report-search-input');
    if (searchInput && searchInput.value !== reportSearchTerm) {
        searchInput.value = reportSearchTerm;
    }

    const fromInput = getEl('report-filter-from');
    if (fromInput && fromInput.value !== reportFilterFrom) {
        fromInput.value = reportFilterFrom;
    }

    const toInput = getEl('report-filter-to');
    if (toInput && toInput.value !== reportFilterTo) {
        toInput.value = reportFilterTo;
    }

    syncMultiSelectSelection('report-filter-store', reportFilterStoreIds);
    syncMultiSelectSelection('report-filter-user', reportFilterUserIds);
    syncMultiSelectSelection('report-filter-form', reportFilterFormIds);

    if (allReports.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 py-4">Aucun rapport soumis pour le moment.</p>';
        if (countElement) countElement.textContent = '0 rapport';
        return;
    }

    const normalizedSearch = reportSearchTerm.trim().toLowerCase();
    const fromDate = reportFilterFrom ? new Date(reportFilterFrom) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDate = reportFilterTo ? new Date(reportFilterTo) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);
    const storeFilterSet = reportFilterStoreIds.length ? new Set(reportFilterStoreIds) : null;
    const userFilterSet = reportFilterUserIds.length ? new Set(reportFilterUserIds) : null;
    const formFilterSet = reportFilterFormIds.length ? new Set(reportFilterFormIds) : null;

    const hasActiveFilters = normalizedSearch.length > 0
        || (storeFilterSet && storeFilterSet.size > 0)
        || (userFilterSet && userFilterSet.size > 0)
        || (formFilterSet && formFilterSet.size > 0)
        || Boolean(reportFilterFrom)
        || Boolean(reportFilterTo);

    const grouped = new Map();

    allReports.forEach(report => {
        if (storeFilterSet && !storeFilterSet.has(report.storeId)) return;
        if (userFilterSet && !userFilterSet.has(report.userId)) return;
        if (formFilterSet && !formFilterSet.has(report.formId)) return;

        const reportDateObj = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        if (fromDate && (!reportDateObj || reportDateObj < fromDate)) return;
        if (toDate && (!reportDateObj || reportDateObj > toDate)) return;

        const store = allStores.find(s => s.id === report.storeId);
        const storeName = store ? store.name : 'Magasin inconnu';
        const storeCode = store ? (store.code || '') : '';

        const form = allForms.find(f => f.id === report.formId);
        const formTitle = form ? form.title : '';

        const user = allUsers.find(u => u.id === report.userId);
        const submitterLabelRaw = getDisplayName(user) || user?.email || report.userEmail || '';
        const submitterEmailRaw = user?.email && user.email !== submitterLabelRaw
            ? user.email
            : (report.userEmail && report.userEmail !== submitterLabelRaw ? report.userEmail : '');

        const searchSources = [
            storeName,
            storeCode,
            formTitle,
            submitterLabelRaw,
            submitterEmailRaw
        ].map(value => (value || '').toLowerCase());

        if (normalizedSearch && !searchSources.some(value => value.includes(normalizedSearch))) {
            return;
        }

        if (!grouped.has(report.storeId)) {
            grouped.set(report.storeId, { store, reports: [] });
        }

        grouped.get(report.storeId).reports.push({
            ...report,
            _meta: {
                storeName,
                storeCode,
                formTitle,
                submitterLabelRaw,
                submitterEmailRaw,
                reportDateObj
            }
        });
    });

    if (grouped.size === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 py-4">Aucun rapport ne correspond à votre recherche.</p>';
        if (countElement) {
            const totalLabel = allReports.length > 1 ? 'rapports' : 'rapport';
            countElement.textContent = `0 rapport (sur ${allReports.length} ${totalLabel})`;
        }
        return;
    }

    openReportStoreIds = new Set([...openReportStoreIds].filter(id => grouped.has(id)));

    const groupedArray = Array.from(grouped.entries()).map(([storeId, data]) => ({
        storeId,
        store: data.store,
        reports: data.reports.sort((a, b) => {
            const dateA = a._meta.reportDateObj || new Date(0);
            const dateB = b._meta.reportDateObj || new Date(0);
            return dateB - dateA;
        })
    })).sort((a, b) => {
        const nameA = a.store ? a.store.name : '';
        const nameB = b.store ? b.store.name : '';
        return nameA.localeCompare(nameB);
    });

    const totalReports = groupedArray.reduce((sum, group) => sum + group.reports.length, 0);
    if (countElement) {
        const label = totalReports > 1 ? 'rapports' : 'rapport';
        const suffix = totalReports !== allReports.length ? ` (sur ${allReports.length})` : '';
        countElement.textContent = `${totalReports} ${label}${suffix}`;
    }

    listContainer.innerHTML = groupedArray.map(group => {
        const storeName = group.store ? group.store.name : 'Magasin inconnu';
        const storeCode = group.store && group.store.code ? group.store.code : '';
        const storeNameSafe = escapeHtml(storeName);
        const storeCodeSafe = escapeHtml(storeCode);
        const isOpen = hasActiveFilters || openReportStoreIds.has(group.storeId);
        const toggleIcon = isOpen ? '&minus;' : '+';
        const wrapperClasses = `${isOpen ? '' : 'hidden'} space-y-4 p-4`;

        const reportsHtml = group.reports.map(report => {
            const meta = report._meta || {};
            const reportDateLabel = meta.reportDateObj ? meta.reportDateObj.toLocaleString('fr-FR') : 'Date inconnue';
            const reportDateSafe = escapeHtml(reportDateLabel);
            const submitterSafe = escapeHtml(meta.submitterLabelRaw || 'Utilisateur inconnu');
            const submitterEmailSafe = meta.submitterEmailRaw ? escapeHtml(meta.submitterEmailRaw) : '';
            const submitterEmailMarkup = submitterEmailSafe
                ? ` <span class="text-xs text-gray-400">(${submitterEmailSafe})</span>`
                : '';
            const formTitleSafe = escapeHtml(meta.formTitle || 'Formulaire inconnu');
            const storeMetaLabel = meta.storeCode ? `${escapeHtml(meta.storeCode)} • ${storeNameSafe}` : storeNameSafe;

            const dataEntries = Object.entries(report.data || {});
            const dataHtml = dataEntries.length > 0
                ? dataEntries.map(([key, value]) => {
                    const keySafe = escapeHtml(key);
                    if (Array.isArray(value)) {
                        const listItems = value.map(v => `<li>• ${escapeHtml(v)}</li>`).join('');
                        return `<li><strong>${keySafe}</strong><ul>${listItems}</ul></li>`;
                    }
                    return `<li><strong>${keySafe}</strong> : <span class="font-medium">${escapeHtml(value)}</span></li>`;
                }).join('')
                : '<li>Aucune donnée</li>';

            return `
                <div class="report-card" data-report-id="${report.id}">
                    <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div class="space-y-1">
                            <p class="text-xs uppercase tracking-[0.3em] text-gray-400">${reportDateSafe}</p>
                            <h4>${formTitleSafe}</h4>
                            <p class="report-card-meta">Soumis par <span class="font-semibold">${submitterSafe}</span>${submitterEmailMarkup}</p>
                            <p class="report-card-meta text-xs">${storeMetaLabel}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button class="edit-report-btn text-xs bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 font-semibold" data-report-id="${report.id}">Éditer</button>
                            <button class="delete-report-btn text-xs btn-danger text-white px-3 py-1 rounded-lg hover:bg-red-600 font-semibold" data-report-id="${report.id}">Supprimer</button>
                        </div>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-3 mt-3">
                        <h5 class="text-sm font-semibold text-gray-600 mb-2">Champs renseignés</h5>
                        <ul class="report-data-list space-y-1">${dataHtml}</ul>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="report-store-card" data-report-store-id="${group.storeId}">
                <button type="button" class="report-store-toggle w-full text-left report-store-header" data-store-id="${group.storeId}">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-xs uppercase tracking-[0.3em] text-gray-400">Magasin</p>
                            <h3 class="text-xl font-bold text-primary-dark">${storeNameSafe}</h3>
                            ${storeCode ? `<p class="text-sm text-gray-500">Code : ${storeCodeSafe}</p>` : ''}
                        </div>
                        <div class="text-right">
                            <p class="text-sm font-semibold text-gray-600">${group.reports.length} rapport(s)</p>
                            <span class="text-2xl font-black text-secondary">${toggleIcon}</span>
                        </div>
                    </div>
                </button>
                <div class="${wrapperClasses}" data-report-store="${group.storeId}">
                    ${reportsHtml}
                </div>
            </div>
        `;
    }).join('');
}

async function handleReportsListClick(e) {
    const toggleBtn = e.target.closest('.report-store-toggle');
    if (toggleBtn) {
        const storeId = toggleBtn.dataset.storeId;
        if (openReportStoreIds.has(storeId)) {
            openReportStoreIds.delete(storeId);
        } else {
            openReportStoreIds.add(storeId);
        }
        renderReportsList();
        return;
    }

    const target = e.target;
    if (!isAuthReady) return;

    if (target.classList.contains('edit-report-btn')) {
        const reportId = target.dataset.reportId;
        openEditReportModal(reportId);
        return;
    }

    if (target.classList.contains('delete-report-btn')) {
        const reportId = target.dataset.reportId;

        showConfirmationModal(
            'Supprimer ce rapport ?',
            'Le rapport sera supprimé définitivement.',
            async () => {
                try {
                    const reportRef = doc(reportsCollection, reportId);
                    const snapshot = await getDoc(reportRef);
                    if (!snapshot.exists()) {
                        showMessage('Rapport introuvable.', 'error');
                        return;
                    }
                    const reportData = snapshot.data();

                    await deleteDoc(reportRef);

                    showMessage('Rapport supprimé.', 'success', {
                        actionLabel: 'Annuler',
                        duration: 5000,
                        onAction: async () => {
                            await setDoc(reportRef, reportData);
                            showMessage('Suppression annulée.', 'success');
                        }
                    });
                } catch (error) {
                    console.error('Erreur suppression rapport:', error);
                    showMessage('Erreur lors de la suppression.', 'error');
                }
            }
        );
    }
}

function openExcelModal() {
    if (!isAuthReady) {
        showMessage('Connectez-vous pour exporter les rapports.', 'error');
        return;
    }
    populateExcelModalFilters();
    const modal = getEl('excel-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function populateExcelModalFilters() {
    const fromInput = getEl('excel-filter-from');
    const toInput = getEl('excel-filter-to');
    const storeOptions = allStores.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(store => {
        const code = store.code ? ` (${store.code})` : '';
        return { value: store.id, label: `${store.name || 'Magasin'}${code}` };
    });
    const userOptions = allUsers.slice().sort((a, b) => (getDisplayName(a) || a.email || '').localeCompare(getDisplayName(b) || b.email || '')).map(user => ({
        value: user.id,
        label: getDisplayName(user) || user.email || 'Utilisateur'
    }));
    const formOptions = allForms.slice().sort((a, b) => a.title.localeCompare(b.title)).map(form => ({
        value: form.id,
        label: form.title
    }));

    const storeDefaults = excelFilterStoreIds.length ? excelFilterStoreIds : reportFilterStoreIds;
    const userDefaults = excelFilterUserIds.length ? excelFilterUserIds : reportFilterUserIds;
    const formDefaults = excelFilterFormIds.length ? excelFilterFormIds : reportFilterFormIds;

    setMultiSelectOptions('excel-filter-store', storeOptions, [...storeDefaults]);
    setMultiSelectOptions('excel-filter-user', userOptions, [...userDefaults]);
    setMultiSelectOptions('excel-filter-form', formOptions, [...formDefaults]);

    if (fromInput) fromInput.value = excelFilterFrom || reportFilterFrom || '';
    if (toInput) toInput.value = excelFilterTo || reportFilterTo || '';
}

function resetExcelModalFilters() {
    excelFilterStoreIds = [];
    excelFilterUserIds = [];
    excelFilterFormIds = [];
    excelFilterFrom = '';
    excelFilterTo = '';
    ['excel-filter-store', 'excel-filter-user', 'excel-filter-form'].forEach(clearMultiSelect);
    const fromInput = getEl('excel-filter-from');
    const toInput = getEl('excel-filter-to');
    if (fromInput) fromInput.value = '';
    if (toInput) toInput.value = '';
}

function filterReportsForExport(filters) {
    const fromDate = filters.from ? new Date(filters.from) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDate = filters.to ? new Date(filters.to) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    const storeSet = filters.storeIds && filters.storeIds.length ? new Set(filters.storeIds) : null;
    const userSet = filters.userIds && filters.userIds.length ? new Set(filters.userIds) : null;
    const formSet = filters.formIds && filters.formIds.length ? new Set(filters.formIds) : null;

    return allReports.filter(report => {
        if (storeSet && !storeSet.has(report.storeId)) return false;
        if (userSet && !userSet.has(report.userId)) return false;
        if (formSet && !formSet.has(report.formId)) return false;

        const reportDateObj = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        if (fromDate && (!reportDateObj || reportDateObj < fromDate)) return false;
        if (toDate && (!reportDateObj || reportDateObj > toDate)) return false;

        return true;
    });
}

function flattenReportData(data = {}) {
    const entries = Object.entries(data);
    if (entries.length === 0) return '';
    return entries.map(([key, value]) => {
        if (Array.isArray(value)) {
            return `${key}: ${value.join(', ')}`;
        }
        return `${key}: ${value ?? ''}`;
    }).join('\n');
}

function closeModalIfPossible(modalId) {
    const modal = getEl(modalId);
    if (modal) {
        closeModal(modal);
    }
}

function getUserLabelFromReport(report) {
    const user = allUsers.find(u => u.id === report.userId);
    return {
        name: getDisplayName(user) || user?.email || report.userEmail || '',
        email: user?.email || report.userEmail || ''
    };
}

function getStoreMetaFromReport(report) {
    const store = allStores.find(s => s.id === report.storeId);
    const equipment = allEquipment.find(eq => eq.id === report.equipmentId);
    const form = allForms.find(f => f.id === report.formId);
    return {
        storeName: store ? store.name || '' : '',
        storeCode: store ? store.code || '' : '',
        equipmentName: equipment ? equipment.name || '' : '',
        formTitle: form ? form.title || '' : ''
    };
}

function formatReportDate(report) {
    const reportDateObj = report.timestamp?.toDate ? report.timestamp.toDate() : null;
    return reportDateObj ? reportDateObj.toLocaleString('fr-FR') : '';
}

function handleExcelExport(e) {
    e.preventDefault();

    if (typeof XLSX === 'undefined') {
        showMessage('La librairie Excel est indisponible.', 'error');
        return;
    }

    const fromInput = getEl('excel-filter-from');
    const toInput = getEl('excel-filter-to');

    const filters = {
        storeIds: getMultiSelectSelectedValues('excel-filter-store'),
        userIds: getMultiSelectSelectedValues('excel-filter-user'),
        formIds: getMultiSelectSelectedValues('excel-filter-form'),
        from: fromInput ? fromInput.value : '',
        to: toInput ? toInput.value : ''
    };

    excelFilterStoreIds = [...filters.storeIds];
    excelFilterUserIds = [...filters.userIds];
    excelFilterFormIds = [...filters.formIds];
    excelFilterFrom = filters.from;
    excelFilterTo = filters.to;

    const filteredReports = filterReportsForExport(filters);
    if (filteredReports.length === 0) {
        showMessage('Aucun rapport ne correspond à ces filtres.', 'error');
        return;
    }

    const rows = filteredReports.map(report => {
        const meta = getStoreMetaFromReport(report);
        const userInfo = getUserLabelFromReport(report);
        const flatData = flattenReportData(report.data || {});
        return [
            formatReportDate(report),
            meta.storeName,
            meta.storeCode,
            meta.equipmentName,
            meta.formTitle,
            userInfo.name,
            userInfo.email,
            flatData
        ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([
        ['Date', 'Magasin', 'Code', 'Appareil', 'Formulaire', 'Intervenant', 'Email', 'Champs saisis'],
        ...rows
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rapports');
    const timestamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `rapports_magasin_${timestamp}.xlsx`);

    closeModalIfPossible('excel-modal');
    showMessage('Extraction Excel générée.', 'success');
}

function openEditReportModal(reportId) {
    const report = allReports.find(r => r.id === reportId);
    if (!report) {
        showMessage('Rapport introuvable.', 'error');
        return;
    }

    const fieldsContainer = getEl('edit-report-fields');
    fieldsContainer.innerHTML = '';

    const entries = Object.entries(report.data || {});
    if (entries.length === 0) {
        fieldsContainer.innerHTML = '<p class="text-sm text-gray-500">Aucune donnée à modifier.</p>';
    } else {
        entries.forEach(([key, value]) => {
            const isArray = Array.isArray(value);
            const currentValue = isArray ? value.join('\n') : String(value ?? '');
            const rows = Math.max(2, currentValue.split('\n').length);
            const keySafe = escapeHtml(key);
            const safeValue = escapeHtml(currentValue);
            fieldsContainer.insertAdjacentHTML('beforeend', `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${keySafe}</label>
                    <textarea class="form-field" data-key="${escapeHtml(key)}" data-type="${isArray ? 'array' : 'string'}" rows="${rows}">${safeValue}</textarea>
                </div>
            `);
        });
    }

    getEl('edit-report-id').value = report.id;
    getEl('edit-report-modal').classList.remove('hidden');
}

async function handleEditReportSubmit(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const reportId = getEl('edit-report-id').value;
    const reportRef = doc(reportsCollection, reportId);

    const fields = Array.from(document.querySelectorAll('#edit-report-fields textarea'));
    const updatedData = {};

    if (fields.length === 0) {
        closeModal(getEl('edit-report-modal'));
        showMessage('Aucune donnée à mettre à jour pour ce rapport.', 'success');
        return;
    }

    fields.forEach(field => {
        const key = field.dataset.key;
        const type = field.dataset.type;
        const value = field.value.trim();

        if (type === 'array') {
            updatedData[key] = value ? value.split('\n').map(v => v.trim()).filter(v => v.length > 0) : [];
        } else {
            updatedData[key] = value;
        }
    });

    try {
        await updateDoc(reportRef, { data: updatedData });
        closeModal(getEl('edit-report-modal'));
        showMessage('Rapport mis à jour.', 'success');
    } catch (error) {
        console.error('Erreur mise à jour rapport:', error);
        showMessage('Erreur lors de la mise à jour du rapport.', 'error');
    }
}

// Rendu de la liste des utilisateurs (Admin)
function updateUserFilterOptions() {
    const roleOptions = Array.from(new Set(allUsers.map(user => (user.role || 'user'))))
        .sort()
        .map(value => ({ value, label: formatRoleLabel(value) }));
    userFilterRoles = setMultiSelectOptions('user-filter-role', roleOptions, userFilterRoles);

    const fonctionMap = new Map();
    allUsers.forEach(user => {
        const raw = (user.fonction || '').trim();
        const key = raw.length ? raw.toLowerCase() : 'non-defini';
        const label = raw.length ? raw : 'Non renseigné';
        if (!fonctionMap.has(key)) {
            fonctionMap.set(key, label);
        }
    });
    const fonctionOptions = Array.from(fonctionMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }));
    userFilterFunctions = setMultiSelectOptions('user-filter-function', fonctionOptions, userFilterFunctions);

    const statusMap = new Map();
    allUsers.forEach(user => {
        const statusKey = getUserStatusKey(user);
        if (!statusMap.has(statusKey)) {
            statusMap.set(statusKey, getUserStatusLabel(statusKey));
        }
    });
    const statusOptions = Array.from(statusMap.entries()).map(([value, label]) => ({ value, label }));
    userFilterStatuses = setMultiSelectOptions('user-filter-status', statusOptions, userFilterStatuses);
}

function renderUsersList(users) {
    const listContainer = getEl('users-list');
    const countElement = getEl('users-count');
    const searchInput = getEl('user-search-input');
    if (!listContainer) return;

    allUsers = Array.isArray(users) ? [...users] : [];

    if (searchInput && searchInput.value !== userSearchTerm) {
        searchInput.value = userSearchTerm;
    }

    if (allUsers.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun utilisateur enregistré pour le moment.</p>';
        if (countElement) countElement.textContent = '0 utilisateur';
        updateReportUserFilter();
        renderReportsList();
        return;
    }

    const activeProfile = allUsers.find(u => u.id === currentUserId);
    if (activeProfile) {
        currentUserProfile = { ...activeProfile };
        updateWelcomeMessage();
    }

    updateReportUserFilter();
    updateUserFilterOptions();

    const normalizedTerm = userSearchTerm.trim().toLowerCase();
    const roleFilterSet = userFilterRoles.length ? new Set(userFilterRoles) : null;
    const fonctionFilterSet = userFilterFunctions.length ? new Set(userFilterFunctions) : null;
    const statusFilterSet = userFilterStatuses.length ? new Set(userFilterStatuses) : null;
    const filteredUsers = allUsers
        .filter(user => {
            if (roleFilterSet && !roleFilterSet.has(user.role || 'user')) return false;
            const fonctionKey = (user.fonction && user.fonction.trim().length)
                ? user.fonction.trim().toLowerCase()
                : 'non-defini';
            if (fonctionFilterSet && !fonctionFilterSet.has(fonctionKey)) return false;
            const statusKey = getUserStatusKey(user);
            if (statusFilterSet && !statusFilterSet.has(statusKey)) return false;
            if (!normalizedTerm) return true;
            const name = (getDisplayName(user) || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            const role = (user.role || '').toLowerCase();
            const fonction = (user.fonction || '').toLowerCase();
            return name.includes(normalizedTerm)
                || email.includes(normalizedTerm)
                || role.includes(normalizedTerm)
                || fonction.includes(normalizedTerm);
        })
        .sort((a, b) => {
            const nameA = (getDisplayName(a) || a.email || '').toLowerCase();
            const nameB = (getDisplayName(b) || b.email || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

    if (countElement) {
        const total = allUsers.length;
        const filteredCount = filteredUsers.length;
        const label = filteredCount > 1 ? 'utilisateurs' : 'utilisateur';
        const suffix = filteredCount !== total ? ` (sur ${total})` : '';
        countElement.textContent = `${filteredCount} ${label}${suffix}`;
    }

    if (filteredUsers.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun utilisateur ne correspond à votre recherche.</p>';
        renderReportsList();
        return;
    }

    listContainer.innerHTML = filteredUsers.map(user => {
        const isCurrentUser = user.id === currentUserId;
        const userIdAttr = escapeHtml(user.id || '');
        const emailAttr = escapeHtml(user.email || '');
        const firstNameValue = escapeHtml(user.firstName || '');
        const lastNameValue = escapeHtml(user.lastName || '');
        const fonctionValue = escapeHtml(user.fonction || '');
        const displayName = escapeHtml(getDisplayName(user) || 'Nom non renseigné');
        const userRole = user.role || 'user';

        const roleOptions = userRole === 'new'
            ? `
                    <option value="new" ${userRole === 'new' ? 'selected' : ''}>Nouveau (En attente)</option>
                    <option value="user" ${userRole === 'user' ? 'selected' : ''}>Utilisateur</option>
                    <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Administrateur</option>
                `
            : `
                    <option value="user" ${userRole === 'user' ? 'selected' : ''}>Utilisateur</option>
                    <option value="admin" ${userRole === 'admin' ? 'selected' : ''}>Administrateur</option>
                `;

        const statusKey = getUserStatusKey(user);
        const statusLabel = getUserStatusLabel(statusKey);
        let statusBadge = '<span class="badge bg-emerald-100 text-emerald-800">' + statusLabel + '</span>';
        if (statusKey === 'pending' || statusKey === 'invited') {
            statusBadge = `<span class="badge bg-amber-100 text-amber-800">${statusLabel}</span>`;
        } else if (statusKey === 'pending-password') {
            statusBadge = '<span class="badge bg-secondary text-white">MDP à changer</span>';
        }

        const resetButtonLabel = user.mustChangePassword
            ? 'Réinitialisation en attente'
            : 'Forcer la réinitialisation';

        const resetButtonDisabled = user.mustChangePassword ? 'disabled' : '';

        const roleBadge = userRole === 'admin'
            ? '<span class="badge bg-primary text-white">' + formatRoleLabel(userRole) + '</span>'
            : (userRole === 'new'
                ? '<span class="badge bg-amber-100 text-amber-800">' + formatRoleLabel(userRole) + '</span>'
                : '<span class="badge bg-emerald-100 text-emerald-800">' + formatRoleLabel(userRole) + '</span>');

        const baseClasses = ['user-row', 'border', 'border-gray-200', 'rounded-xl', 'p-4', 'space-y-3', 'shadow-sm', 'bg-white'];
        if (isCurrentUser) baseClasses.push('border-emerald-400', 'shadow-md');
        if (userRole === 'new') baseClasses.push('bg-amber-50');
        const rowClass = baseClasses.join(' ');

        const fonctionMarkup = user.fonction
            ? `<p class="text-xs text-gray-500 mt-1">${fonctionValue}</p>`
            : '';

        const emailMarkup = user.email
            ? `<p class="text-sm text-gray-500">${escapeHtml(user.email)}</p>`
            : '<p class="text-sm text-gray-400 italic">Email non renseigné</p>';

        return `
            <div class="${rowClass}" data-user-id="${userIdAttr}" data-user-email="${emailAttr}">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="text-left">
                        <p class="text-base font-semibold text-primary-dark">${displayName}</p>
                        ${emailMarkup}
                        ${fonctionMarkup}
                    </div>
                    <div class="user-summary-badges">
                        ${statusBadge}
                        ${roleBadge}
                        <button type="button" class="toggle-user-details btn btn-secondary text-xs py-1" data-user-id="${userIdAttr}">Modifier</button>
                    </div>
                </div>
                <div class="user-details hidden pt-3 mt-3 space-y-3">
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-500">Prénom</label>
                            <input type="text" class="form-field text-sm py-2" data-key="firstName" value="${firstNameValue}" ${isCurrentUser ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500">Nom</label>
                            <input type="text" class="form-field text-sm py-2" data-key="lastName" value="${lastNameValue}" ${isCurrentUser ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500">Fonction</label>
                            <input type="text" class="form-field text-sm py-2" data-key="fonction" value="${fonctionValue}" placeholder="ex: Technicien" ${isCurrentUser ? 'disabled' : ''}>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500">Rôle</label>
                            <select class="form-field custom-select text-sm py-2" data-key="role" ${isCurrentUser ? 'disabled' : ''}>
                                ${roleOptions}
                            </select>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="save-user-btn btn btn-primary text-sm py-1" data-user-id="${userIdAttr}" ${isCurrentUser ? 'disabled' : ''}>Enregistrer</button>
                        <button type="button" class="force-reset-btn btn btn-secondary text-sm py-1" data-user-id="${userIdAttr}" ${isCurrentUser ? 'disabled' : resetButtonDisabled}>${resetButtonLabel}</button>
                        <button type="button" class="delete-user-btn btn btn-danger text-sm py-1" data-user-id="${userIdAttr}" ${isCurrentUser ? 'disabled' : ''}>Supprimer</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    renderReportsList();
}

// Rendu de la liste des types d'appareils (Admin)
function renderEquipmentTypesList() {
    const listContainer = getEl('equip-types-list');
    if (!listContainer) return; 

    if (allEquipmentTypes.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-gray-500">Aucun type d\'appareil créé.</p>';
        return;
    }

    listContainer.innerHTML = allEquipmentTypes
        .sort((a, b) => a.label.localeCompare(b.label)) // Trier par nom
        .map(type => {
        return `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-md">
            <div>
                <span class="text-xl mr-2">${type.emoji}</span>
                <span class="font-medium text-sm">${type.label}</span>
            </div>
            <div class="flex space-x-2">
                <button class="edit-equip-type-btn text-yellow-600 hover:underline text-xs" data-type-id="${type.id}">
                    Modifier
                </button>
                <button class="delete-equip-type-btn text-danger hover:underline text-xs" data-type-id="${type.id}">
                    Supprimer
                </button>
            </div>
            </div>
        `;
    }).join('');

    updateAnalyticsDashboard();
}

function getFilteredReportsForAnalytics() {
    const storeSet = analyticsFilterStoreIds.length ? new Set(analyticsFilterStoreIds) : null;
    const userSet = analyticsFilterUserIds.length ? new Set(analyticsFilterUserIds) : null;
    const formSet = analyticsFilterFormIds.length ? new Set(analyticsFilterFormIds) : null;
    const typeSet = analyticsFilterTypeKeys.length ? new Set(analyticsFilterTypeKeys) : null;
    const fromDate = analyticsFilterFrom ? new Date(analyticsFilterFrom) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDate = analyticsFilterTo ? new Date(analyticsFilterTo) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    return allReports.filter(report => {
        if (storeSet && !storeSet.has(report.storeId)) return false;
        if (userSet && !userSet.has(report.userId)) return false;
        if (formSet && !formSet.has(report.formId)) return false;
        if (typeSet) {
            const form = allForms.find(f => f.id === report.formId);
            if (!typeSet.has(getFormTypeKey(form))) return false;
        }
        const reportDate = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        if (fromDate && (!reportDate || reportDate < fromDate)) return false;
        if (toDate && (!reportDate || reportDate > toDate)) return false;
        return true;
    });
}

function getFilteredFormsForAnalytics() {
    const fromDate = analyticsFilterFrom ? new Date(analyticsFilterFrom) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    const toDate = analyticsFilterTo ? new Date(analyticsFilterTo) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    return allForms.filter(form => {
        const createdAt = normalizeTimestamp(form.createdAt);
        if (!createdAt) {
            return !(fromDate || toDate);
        }
        if (fromDate && createdAt < fromDate) return false;
        if (toDate && createdAt > toDate) return false;
        return true;
    });
}

function updateAnalyticsDashboard() {
    if (document.body.dataset.role !== 'admin') return;
    const filteredReports = getFilteredReportsForAnalytics();
    const filteredForms = getFilteredFormsForAnalytics();
    updateAnalyticsKpis(filteredReports);
    updateVisitsCharts(filteredReports);
    updateTopStoresChart(filteredReports);
    updateTopFormsChart(filteredReports);
    updateFormsEvolutionChart(filteredReports, filteredForms);
    updateFormsDistributionChart(filteredReports);
}

function updateAnalyticsKpis(reports) {
    const visitsValue = reports.filter(report => {
        const date = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        if (!date) return false;
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 29);
        threshold.setHours(0, 0, 0, 0);
        return date >= threshold;
    }).length;
    const storesValue = new Set(reports.map(report => report.storeId)).size;
    const formsValue = new Set(reports.map(report => report.formId)).size;

    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - 6);
    currentStart.setHours(0, 0, 0, 0);
    const previousStart = new Date(now);
    previousStart.setDate(now.getDate() - 13);
    previousStart.setHours(0, 0, 0, 0);
    const previousEnd = new Date(now);
    previousEnd.setDate(now.getDate() - 7);
    previousEnd.setHours(23, 59, 59, 999);

    const currentCount = reports.filter(report => {
        const date = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        return date && date >= currentStart;
    }).length;
    const previousCount = reports.filter(report => {
        const date = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        return date && date >= previousStart && date <= previousEnd;
    }).length;
    const trend = previousCount === 0
        ? (currentCount > 0 ? 100 : 0)
        : Math.round(((currentCount - previousCount) / previousCount) * 100);

    const visitsEl = getEl('kpi-visits');
    const storesEl = getEl('kpi-stores');
    const formsEl = getEl('kpi-forms');
    const trendEl = getEl('kpi-trend');
    if (visitsEl) visitsEl.textContent = visitsValue.toString();
    if (storesEl) storesEl.textContent = storesValue.toString();
    if (formsEl) formsEl.textContent = formsValue.toString();
    if (trendEl) trendEl.textContent = `${trend >= 0 ? '+' : ''}${trend}%`;
}

function updateVisitsCharts(reports) {
    updateSimpleChart('chart-visits-daily', 'bar', ...buildPeriodSeries(reports, 'day', 10), '#00594E');
    updateSimpleChart('chart-visits-weekly', 'line', ...buildPeriodSeries(reports, 'week', 8), '#E56A54');
    updateSimpleChart('chart-visits-monthly', 'line', ...buildPeriodSeries(reports, 'month', 6), '#1F2933');
}

function buildPeriodSeries(reports, unit, limit) {
    const buckets = new Map();
    reports.forEach(report => {
        const date = report.timestamp?.toDate ? report.timestamp.toDate() : null;
        if (!date) return;
        let bucket;
        if (unit === 'day') {
            bucket = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        } else if (unit === 'week') {
            bucket = startOfWeek(date);
        } else {
            bucket = startOfMonth(date);
        }
        const key = bucket.toISOString();
        buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const sorted = Array.from(buckets.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0])).slice(-limit);
    const labels = sorted.map(([iso]) => formatPeriodLabel(new Date(iso), unit));
    const data = sorted.map(([, count]) => count);
    return [labels, data];
}

function formatPeriodLabel(date, unit) {
    if (!(date instanceof Date)) return '';
    const options = { month: 'short', day: '2-digit' };
    switch (unit) {
        case 'day':
            return date.toLocaleDateString('fr-FR', options);
        case 'week':
            return `Semaine du ${date.toLocaleDateString('fr-FR', options)}`;
        case 'month':
        default:
            return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    }
}

function updateTopStoresChart(reports) {
    const counts = new Map();
    reports.forEach(report => {
        counts.set(report.storeId, (counts.get(report.storeId) || 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = top.map(([storeId]) => {
        const store = allStores.find(s => s.id === storeId);
        return store ? store.name : 'Magasin';
    });
    const data = top.map(([, count]) => count);
    updateSimpleChart('chart-top-stores', 'bar', labels, data, '#00594E');
}

function updateTopFormsChart(reports) {
    const counts = new Map();
    reports.forEach(report => {
        counts.set(report.formId, (counts.get(report.formId) || 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = top.map(([formId]) => {
        const form = allForms.find(f => f.id === formId);
        return form ? form.title : 'Formulaire';
    });
    const data = top.map(([, count]) => count);
    updateSimpleChart('chart-top-forms', 'bar', labels, data, '#E56A54');
}

function updateFormsEvolutionChart(reports, forms) {
    const creationSeries = buildMonthlySeries(forms, (form) => normalizeTimestamp(form.createdAt), 12);
    const validationSeries = buildMonthlySeries(reports, (report) => report.timestamp?.toDate ? report.timestamp.toDate() : null, 12);
    const mergedKeys = Array.from(new Set([...(creationSeries.keys || []), ...(validationSeries.keys || [])]))
        .sort((a, b) => new Date(a) - new Date(b))
        .slice(-12);
    const labels = mergedKeys.map(key => formatPeriodLabel(new Date(key), 'month'));
    const creationData = mergedKeys.map(key => {
        const idx = creationSeries.keys ? creationSeries.keys.indexOf(key) : -1;
        return idx >= 0 ? creationSeries.data[idx] : 0;
    });
    const validationData = mergedKeys.map(key => {
        const idx = validationSeries.keys ? validationSeries.keys.indexOf(key) : -1;
        return idx >= 0 ? validationSeries.data[idx] : 0;
    });
    updateMultiDatasetChart('chart-forms-evolution', labels, [
        {
            label: 'Formulaires créés',
            data: creationData,
            borderColor: '#E56A54',
            backgroundColor: 'rgba(229,106,84,0.2)'
        },
        {
            label: 'Formulaires validés',
            data: validationData,
            borderColor: '#00594E',
            backgroundColor: 'rgba(0,89,78,0.2)'
        }
    ]);
}

function buildMonthlySeries(items, getDateFn, limit) {
    const buckets = new Map();
    items.forEach(item => {
        const date = getDateFn(item);
        if (!date) return;
        const bucket = startOfMonth(date);
        const key = bucket.toISOString();
        buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const keys = Array.from(buckets.keys()).sort((a, b) => new Date(a) - new Date(b)).slice(-limit);
    return {
        keys,
        labels: keys.map(key => formatPeriodLabel(new Date(key), 'month')),
        data: keys.map(key => buckets.get(key) || 0)
    };
}

function updateFormsDistributionChart(reports) {
    const counts = new Map();
    reports.forEach(report => {
        const form = allForms.find(f => f.id === report.formId);
        const label = getFormTypeLabel(form);
        counts.set(label, (counts.get(label) || 0) + 1);
    });
    const labels = Array.from(counts.keys());
    const data = labels.map(label => counts.get(label));
    updatePieChart('chart-forms-distribution', labels, data);
}

function updateSimpleChart(canvasId, chartType, labels = [], data = [], color = '#00594E') {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const hasData = Array.isArray(labels) && labels.length > 0 && Array.isArray(data) && data.length > 0;
    const safeLabels = hasData ? labels : ['Aucune donnée'];
    const safeData = hasData ? data : [0];
    const fillColor = chartType === 'bar' ? color : applyAlphaToColor(color, 0.25);
    const dataset = {
        label: 'Rapports',
        data: safeData,
        borderColor: color,
        backgroundColor: fillColor,
        tension: 0.3,
        fill: chartType !== 'bar'
    };
    if (!analyticsCharts[canvasId]) {
        analyticsCharts[canvasId] = new Chart(ctx, {
            type: chartType,
            data: { labels: safeLabels, datasets: [dataset] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, precision: 0 } }
            }
        });
    } else {
        const chart = analyticsCharts[canvasId];
        chart.data.labels = safeLabels;
        if (!chart.data.datasets.length) {
            chart.data.datasets.push(dataset);
        }
        chart.data.datasets[0].data = safeData;
        chart.data.datasets[0].borderColor = color;
        chart.data.datasets[0].backgroundColor = fillColor;
        chart.update();
    }
}

function updateMultiDatasetChart(canvasId, labels = [], datasetsConfig = []) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const hasLabels = Array.isArray(labels) && labels.length > 0;
    const safeLabels = hasLabels ? labels : ['Aucune donnée'];
    const safeDatasets = datasetsConfig.map(cfg => ({
        label: cfg.label,
        data: hasLabels && Array.isArray(cfg.data) && cfg.data.length ? cfg.data : [0],
        borderColor: cfg.borderColor,
        backgroundColor: cfg.backgroundColor,
        tension: 0.3,
        fill: true
    }));
    if (!analyticsCharts[canvasId]) {
        analyticsCharts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { labels: safeLabels, datasets: safeDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true } },
                scales: { y: { beginAtZero: true, precision: 0 } }
            }
        });
    } else {
        const chart = analyticsCharts[canvasId];
        chart.data.labels = safeLabels;
        chart.data.datasets = safeDatasets;
        chart.update();
    }
}

function updatePieChart(canvasId, labels, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const safeLabels = labels.length ? labels : ['Aucune donnée'];
    const safeData = labels.length ? data : [1];
    const colors = ['#00594E', '#E56A54', '#FFC857', '#1F2933', '#6B7280', '#A78BFA'];
    if (!analyticsCharts[canvasId]) {
        analyticsCharts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: safeLabels,
                datasets: [{
                    data: safeData,
                    backgroundColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    } else {
        const chart = analyticsCharts[canvasId];
        chart.data.labels = safeLabels;
        chart.data.datasets[0].data = safeData;
        chart.update();
    }
}

// Rendu du formulaire d'intervention dynamique
function renderInterventionForm(formId) {
    const form = allForms.find(f => f.id === formId);
    const container = getEl('dynamic-form-fields');

    if (!form) {
        container.innerHTML = `<p class="text-danger">Erreur: Formulaire (ID: ${formId}) introuvable.</p>`;
        return;
    }

    getEl('form-title').textContent = form.title;
    container.innerHTML = form.fields.map(field => {
        const isRequired = field.required ? 'required' : '';
        const fieldId = `form-field-${field.label.replace(/\s+/g, '-')}`;
        const options = (field.options || "").split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

        let inputHtml = '';
        const fieldWrapper = (content) => `
            <div>
                <label for="${fieldId}" class="block text-gray-700 font-medium mb-1">
                    ${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}
                </label>
                ${content}
            </div>`;

        switch (field.type) {
            case 'textarea':
                inputHtml = fieldWrapper(`<textarea id="${fieldId}" name="${field.label}" class="form-field" rows="3" ${isRequired}></textarea>`);
                break;
            case 'number':
                inputHtml = fieldWrapper(`<input type="number" id="${fieldId}" name="${field.label}" class="form-field" ${isRequired}>`);
                break;
            case 'select':
                inputHtml = fieldWrapper(`
                    <select id="${fieldId}" name="${field.label}" class="form-field custom-select" ${isRequired}>
                        <option value="">-- Sélectionnez une option --</option>
                        ${options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                `);
                break;
            case 'radio':
                inputHtml = fieldWrapper(`
                    <div class="mt-2 space-y-2">
                        ${options.map((opt, index) => `
                            <label class="flex items-center">
                                <input type="radio" id="${fieldId}-${index}" name="${field.label}" value="${opt}" class="mr-2" ${isRequired}>
                                <span>${opt}</span>
                            </label>
                        `).join('')}
                    </div>
                `);
                break;
            case 'checkbox':
                // Pour les checkboxes, le name est un tableau
                inputHtml = fieldWrapper(`
                    <div class="mt-2 space-y-2">
                        ${options.map((opt, index) => `
                            <label class="flex items-center">
                                <input type="checkbox" id="${fieldId}-${index}" name="${field.label}" value="${opt}" class="mr-2 rounded">
                                <span>${opt}</span>
                            </label>
                        `).join('')}
                    </div>
                `);
                break;
            case 'text':
            default:
                inputHtml = fieldWrapper(`<input type="text" id="${fieldId}" name="${field.label}" class="form-field" ${isRequired}>`);
        }

        return inputHtml;
    }).join('');
}

// --- REFACTOR: Configuration des Écouteurs d'Événements ---

// Fonction principale qui attache tous les écouteurs statiques au démarrage.
function initializeAppEventListeners() {
    initializeMultiSelectControls();
    // Authentification
    setupAuthEventListeners();

    // Navigation principale
    setupNavigationEventListeners();

    // Menu mobile
    setupMobileMenuEventListeners();

    // Page Magasins (Formulaires et listes)
    setupStorePageEventListeners();

    // Page Formulaires (Form Builder)
    setupFormBuilderEventListeners();

    // Page Intervention
    setupInterventionEventListeners();

    // Page Scanner
    setupScannerEventListeners();

    // Page Admin
    setupAdminEventListeners();

    // Page Rapports
    setupReportEventListeners();

    // Page Analytics
    setupAnalyticsEventListeners();

    // Modales
    setupModalEventListeners();
}

// Groupe: Authentification
function setupAuthEventListeners() {
    getEl('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        getEl('login-form').classList.add('hidden');
        getEl('signup-form').classList.remove('hidden');
    });

    getEl('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        getEl('login-form').classList.remove('hidden');
        getEl('signup-form').classList.add('hidden');
    });

    getEl('signup-form').addEventListener('submit', handleSignup);
    getEl('login-form').addEventListener('submit', handleLogin);

    const forcePasswordForm = getEl('force-password-form');
    if (forcePasswordForm) {
        forcePasswordForm.addEventListener('submit', handleForcePasswordForm);
    }
}

// Groupe: Navigation
function setupNavigationEventListeners() {
    getEl('main-nav').addEventListener('click', (e) => {
        if (e.target.classList.contains('nav-tab')) {
            const pageId = e.target.dataset.page;
            navigateTo(pageId);
        }
    });
}

// Groupe: Page Magasins
function setupStorePageEventListeners() {
    // Formulaires d'ajout
    getEl('add-store-form').addEventListener('submit', handleAddStore);
    getEl('add-equipment-form').addEventListener('submit', handleAddEquipment);

    const storeSearchInput = getEl('store-search-input');
    if (storeSearchInput) {
        storeSearchInput.addEventListener('input', (e) => {
            storeSearchTerm = e.target.value;
            renderStoresList();
        });
    }

    // Clics sur la liste (délégation d'événements)
    getEl('stores-list').addEventListener('click', handleStoresListClick);
    // NOUVEAU: Écouteur pour les checkboxes
    getEl('stores-list').addEventListener('change', handleEquipSelectChange);

    // Soumission des modales d'édition
    getEl('edit-store-form').addEventListener('submit', handleEditStore);
    getEl('edit-equip-form').addEventListener('submit', handleEditEquipment);

    // NOUVEAU: Écouteurs pour la barre d'actions de masse
    getEl('bulk-print-btn').addEventListener('click', handleBulkPrintClick);
    getEl('bulk-duplicate-btn').addEventListener('click', handleBulkDuplicateClick);
    getEl('bulk-delete-btn').addEventListener('click', handleBulkDeleteClick);
    getEl('bulk-deselect-btn').addEventListener('click', handleDeselectAll);

    // NOUVEAU: Soumission de la modale de duplication
    getEl('duplicate-equip-form').addEventListener('submit', handleSubmitDuplicate);
}

// Groupe: Page Formulaires (Form Builder)
function setupFormBuilderEventListeners() {
    getEl('create-form-builder').addEventListener('submit', handleSaveForm);
    getEl('cancel-edit-form-btn').addEventListener('click', resetFormBuilder);
    getEl('add-form-field-btn').addEventListener('click', () => {
        addFormFieldToBuilder(getEl('form-builder-fields'));
    });

    // Délégation pour les champs dynamiques du builder
    const fieldsContainer = getEl('form-builder-fields');
    fieldsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-field-btn')) handleRemoveField(e);
        if (e.target.classList.contains('add-option-btn')) handleAddOption(e);
        if (e.target.classList.contains('remove-option-btn')) handleRemoveOption(e);
    });
    fieldsContainer.addEventListener('change', handleFieldTypeChange);

    // Délégation pour la liste des formulaires existants
    getEl('forms-list').addEventListener('click', handleFormsListClick);
}

// Groupe: Page Intervention
function setupInterventionEventListeners() {
    getEl('intervention-form').addEventListener('submit', handleSubmitIntervention);
    getEl('back-to-scanner').addEventListener('click', () => {
        navigateTo('scanner');
        currentScannedData = null; // Réinitialiser
    });
}

// Groupe: Page Scanner
function setupScannerEventListeners() {
    getEl('start-scan-btn').addEventListener('click', startScan);
    getEl('stop-scan-btn').addEventListener('click', stopScan);
}

// Groupe: Page Admin
function setupAdminEventListeners() {
    const createUserForm = getEl('create-user-form');
    if (createUserForm) {
        createUserForm.addEventListener('submit', handleCreateUser);
    }

    const toggleCreateUserBtn = getEl('toggle-create-user-form');
    if (toggleCreateUserBtn) {
        toggleCreateUserBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCreateUserForm();
        });
    }

    const userSearchInput = getEl('user-search-input');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => {
            userSearchTerm = e.target.value;
            renderUsersList(allUsers);
        });
    }

    const adminFilterSelects = [
        { id: 'user-filter-role', setter: (values) => { userFilterRoles = values; } },
        { id: 'user-filter-function', setter: (values) => { userFilterFunctions = values; } },
        { id: 'user-filter-status', setter: (values) => { userFilterStatuses = values; } }
    ];

    adminFilterSelects.forEach(({ id, setter }) => {
        const select = getEl(id);
        if (select) {
            select.addEventListener('change', () => {
                setter(getMultiSelectSelectedValues(id));
                renderUsersList(allUsers);
            });
        }
    });

    // Délégation pour la liste des utilisateurs
    getEl('users-list').addEventListener('click', handleUsersListClick);

    // Onglets pour type d'appareil
    getEl('tab-model-btn').addEventListener('click', showAdminTabModel);
    getEl('tab-manual-btn').addEventListener('click', showAdminTabManual);

    // Formulaires d'ajout de type
    getEl('add-equip-type-model-form').addEventListener('submit', handleAddEquipTypeModel);
    getEl('add-equip-type-form').addEventListener('submit', handleAddEquipTypeManual);

    // Délégation pour la liste des types
    getEl('equip-types-list').addEventListener('click', handleEquipTypesListClick);

    // Soumission modale édition type
    getEl('edit-equip-type-form').addEventListener('submit', handleEditEquipType);

    setCreateUserFormVisibility(false);
}

// Groupe: Page Rapports
function setupReportEventListeners() {
    const searchInput = getEl('report-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            reportSearchTerm = e.target.value;
            renderReportsList();
        });
    }
    const storeSelect = getEl('report-filter-store');
    if (storeSelect) {
        storeSelect.addEventListener('change', () => {
            reportFilterStoreIds = getMultiSelectSelectedValues('report-filter-store');
            renderReportsList();
        });
    }

    const userSelect = getEl('report-filter-user');
    if (userSelect) {
        userSelect.addEventListener('change', () => {
            reportFilterUserIds = getMultiSelectSelectedValues('report-filter-user');
            renderReportsList();
        });
    }

    const formSelect = getEl('report-filter-form');
    if (formSelect) {
        formSelect.addEventListener('change', () => {
            reportFilterFormIds = getMultiSelectSelectedValues('report-filter-form');
            renderReportsList();
        });
    }

    const fromInput = getEl('report-filter-from');
    if (fromInput) {
        fromInput.addEventListener('change', (e) => {
            reportFilterFrom = e.target.value;
            renderReportsList();
        });
    }

    const toInput = getEl('report-filter-to');
    if (toInput) {
        toInput.addEventListener('change', (e) => {
            reportFilterTo = e.target.value;
            renderReportsList();
        });
    }

    setupDatePresetControls('report-date-presets', (from, to) => {
        reportFilterFrom = from;
        reportFilterTo = to;
        renderReportsList();
    });

    const resetBtn = getEl('report-reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            reportSearchTerm = '';
            reportFilterStoreIds = [];
            reportFilterUserIds = [];
            reportFilterFormIds = [];
            reportFilterFrom = '';
            reportFilterTo = '';
            clearMultiSelect('report-filter-store');
            clearMultiSelect('report-filter-user');
            clearMultiSelect('report-filter-form');
            if (searchInput) searchInput.value = '';
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';
            renderReportsList();
        });
    }

    const reportsList = getEl('reports-list');
    if (reportsList) {
        reportsList.addEventListener('click', handleReportsListClick);
    }

    const editReportForm = getEl('edit-report-form');
    if (editReportForm) {
        editReportForm.addEventListener('submit', handleEditReportSubmit);
    }

    const excelBtn = getEl('open-excel-modal');
    if (excelBtn) {
        excelBtn.addEventListener('click', openExcelModal);
    }

    const excelForm = getEl('excel-export-form');
    if (excelForm) {
        excelForm.addEventListener('submit', handleExcelExport);
    }

    setupDatePresetControls('excel-date-presets', (from, to) => {
        const fromInput = getEl('excel-filter-from');
        const toInput = getEl('excel-filter-to');
        if (fromInput) fromInput.value = from;
        if (toInput) toInput.value = to;
    });
}

function setupAnalyticsEventListeners() {
    const storeSelect = getEl('analytics-filter-store');
    if (storeSelect) {
        storeSelect.addEventListener('change', () => {
            analyticsFilterStoreIds = getMultiSelectSelectedValues('analytics-filter-store');
            updateAnalyticsDashboard();
        });
    }

    const userSelect = getEl('analytics-filter-user');
    if (userSelect) {
        userSelect.addEventListener('change', () => {
            analyticsFilterUserIds = getMultiSelectSelectedValues('analytics-filter-user');
            updateAnalyticsDashboard();
        });
    }

    const formSelect = getEl('analytics-filter-form');
    if (formSelect) {
        formSelect.addEventListener('change', () => {
            analyticsFilterFormIds = getMultiSelectSelectedValues('analytics-filter-form');
            updateAnalyticsDashboard();
        });
    }

    const typeSelect = getEl('analytics-filter-type');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            analyticsFilterTypeKeys = getMultiSelectSelectedValues('analytics-filter-type');
            updateAnalyticsDashboard();
        });
    }

    const fromInput = getEl('analytics-filter-from');
    if (fromInput) {
        fromInput.addEventListener('change', (e) => {
            analyticsFilterFrom = e.target.value;
            updateAnalyticsDashboard();
        });
    }

    const toInput = getEl('analytics-filter-to');
    if (toInput) {
        toInput.addEventListener('change', (e) => {
            analyticsFilterTo = e.target.value;
            updateAnalyticsDashboard();
        });
    }

    setupDatePresetControls('analytics-date-presets', (from, to) => {
        analyticsFilterFrom = from;
        analyticsFilterTo = to;
        updateAnalyticsDashboard();
    });

    const resetBtn = getEl('analytics-reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            analyticsFilterStoreIds = [];
            analyticsFilterUserIds = [];
            analyticsFilterFormIds = [];
            analyticsFilterTypeKeys = [];
            analyticsFilterFrom = '';
            analyticsFilterTo = '';
            clearMultiSelect('analytics-filter-store');
            clearMultiSelect('analytics-filter-user');
            clearMultiSelect('analytics-filter-form');
            clearMultiSelect('analytics-filter-type');
            if (fromInput) fromInput.value = '';
            if (toInput) toInput.value = '';
            updateAnalyticsDashboard();
        });
    }
}

// Groupe: Modales
function setupModalEventListeners() {
    // Boutons de fermeture génériques
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.fixed'));
        });
    });

    // Modale QR Code
    getEl('qr-size-select').addEventListener('change', () => {
         const modalContent = getEl('qr-modal-content');
         const simpleRaw = modalContent.dataset.simpleData || '';
         const simpleData = simpleRaw ? JSON.parse(simpleRaw) : null;
         if (simpleData) {
            generateSingleQrCode(simpleData.data, simpleData.equipName, simpleData.storeName);
         } else if (currentBulkQrData && currentBulkQrData.length > 0) {
            renderBulkQrCodes();
         }
    });
    getEl('close-qr-modal').addEventListener('click', () => {
         closeModal(getEl('qr-modal'));
    });
    getEl('print-qr-btn').addEventListener('click', () => window.print());

    const messageActionBtn = getEl('message-action-btn');
    if (messageActionBtn) {
        messageActionBtn.addEventListener('click', async () => {
            if (typeof messageActionHandler === 'function') {
                const handler = messageActionHandler;
                messageActionHandler = null;
                hideMessageModal();
                try {
                    await handler();
                } catch (error) {
                    console.error('Erreur lors de l\'action du message:', error);
                    showMessage('Impossible d\'annuler cette action.', 'error');
                }
            }
        });
    }

    // Modale de Confirmation
    getEl('confirm-action-btn').addEventListener('click', () => {
        if (typeof _confirmCallback === 'function') {
            _confirmCallback();
        }
        _confirmCallback = null;
        closeModal(getEl('confirm-modal'));
    });
    getEl('confirm-cancel-btn').addEventListener('click', () => {
        _confirmCallback = null;
        closeModal(getEl('confirm-modal'));
    });
}

function setupMobileMenuEventListeners() {
    const openBtn = getEl('mobile-menu-button');
    const closeBtn = getEl('mobile-menu-close');
    const overlay = getEl('mobile-menu-overlay');
    const navLinks = getEl('mobile-nav-links');
    const accountForm = getEl('mobile-account-form');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (!currentUserId) {
                showMessage('Connectez-vous pour accéder au menu.', 'error');
                return;
            }
            openMobileMenu();
        });
    }

    [closeBtn, overlay].forEach(el => {
        if (el) {
            el.addEventListener('click', closeMobileMenu);
        }
    });

    if (navLinks) {
        navLinks.addEventListener('click', (e) => {
            const target = e.target.closest('.mobile-nav-link');
            if (!target) return;
            const pageId = target.dataset.page;
            if (pageId) {
                navigateTo(pageId);
            }
            closeMobileMenu();
        });
    }

    if (accountForm) {
        accountForm.addEventListener('submit', handleMobileAccountFormSubmit);
    }
}

function openMobileMenu() {
    const panel = getEl('mobile-menu-panel');
    if (!panel) return;
    syncMobileAccountForm();
    panel.classList.remove('hidden');
}

function closeMobileMenu() {
    const panel = getEl('mobile-menu-panel');
    if (!panel) return;
    panel.classList.add('hidden');
}

async function handleMobileAccountFormSubmit(e) {
    e.preventDefault();

    if (!isAuthReady || !currentUserId) {
        showMessage('Connectez-vous pour modifier votre profil.', 'error');
        return;
    }

    const firstNameInput = getEl('mobile-account-first-name');
    const lastNameInput = getEl('mobile-account-last-name');
    const fonctionInput = getEl('mobile-account-fonction');

    if (!firstNameInput || !lastNameInput || !fonctionInput) return;

    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const fonction = fonctionInput.value.trim();
    const displayName = `${firstName} ${lastName}`.trim();

    try {
        const userDocRef = doc(usersCollection, currentUserId);
        await updateDoc(userDocRef, {
            firstName,
            lastName,
            fonction,
            displayName,
            updatedAt: new Date()
        });

        currentUserProfile = {
            ...(currentUserProfile || {}),
            firstName,
            lastName,
            fonction,
            displayName
        };
        updateWelcomeMessage();
        showMessage('Profil mis à jour.', 'success');
    } catch (error) {
        console.error('Erreur mise à jour profil:', error);
        showMessage('Impossible de mettre à jour le profil.', 'error');
    }
}

function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');

    if (modalEl.id === 'qr-modal') {
        const content = getEl('qr-modal-content');
        if (content) content.dataset.simpleData = '';
        currentBulkQrData = [];
    }

    if (modalEl.id === 'edit-report-modal') {
        getEl('edit-report-fields').innerHTML = '';
        getEl('edit-report-id').value = '';
    }

    if (modalEl.id === 'excel-modal') {
        resetExcelModalFilters();
    }
}

// --- REFACTOR: Logique Métier (Handlers d'événements) ---

// Handler: Inscription
async function handleSignup(e) {
    e.preventDefault();
    const email = getEl('signup-email').value;
    const password = getEl('signup-password').value;

    try {
        // 1. Créer l'utilisateur dans Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log("Utilisateur créé dans Auth:", user.uid);

        // 2. Rôle "new" par défaut
        const newRole = 'new';
        console.log(`Attribution du rôle: ${newRole}`);

        // 3. Créer le document utilisateur dans Firestore
        await setDoc(doc(usersCollection, user.uid), {
            email: user.email,
            role: newRole,
            fonction: "",
            firstName: "",
            lastName: "",
            displayName: "",
            mustChangePassword: false,
            status: 'pending',
            createdAt: new Date(),
            createdBy: user.uid
        });

        showMessage(`Compte créé avec succès ! Il est en attente d'approbation.`, 'success');
        await signOut(auth); // Déconnecter l'utilisateur
        e.target.reset(); // Vider le formulaire
        getEl('show-login').click(); // Revenir au formulaire de connexion

    } catch (error) {
        console.error("Erreur d'inscription:", error);
        showMessage(`Erreur: ${error.message}`, "error");
    }
}

// Handler: Connexion
async function handleLogin(e) {
    e.preventDefault();
    const email = getEl('login-email').value;
    const password = getEl('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged s'occupe du reste
    } catch (error) {
        console.error("Erreur de connexion:", error);
        showMessage("Email ou mot de passe incorrect.", "error");
    }
}

async function handleForcePasswordForm(e) {
    e.preventDefault();

    if (!auth.currentUser) {
        showMessage("Session expirée. Veuillez vous reconnecter.", 'error');
        return;
    }

    const firstName = getEl('force-first-name').value.trim();
    const lastName = getEl('force-last-name').value.trim();
    const newPassword = getEl('force-password').value;
    const confirmPassword = getEl('force-password-confirm').value;

    if (newPassword !== confirmPassword) {
        showMessage('Les mots de passe ne correspondent pas.', 'error');
        return;
    }

    try {
        await updatePassword(auth.currentUser, newPassword);
        const userDocRef = doc(usersCollection, auth.currentUser.uid);
        const displayName = `${firstName} ${lastName}`.trim();

        await updateDoc(userDocRef, {
            firstName,
            lastName,
            displayName,
            mustChangePassword: false,
            updatedAt: new Date(),
            firstLoginCompletedAt: new Date()
        });

        currentUserProfile = {
            ...(currentUserProfile || {}),
            firstName,
            lastName,
            displayName,
            mustChangePassword: false
        };

        e.target.reset();

        showMessage('Mot de passe mis à jour avec succès.', 'success');
        initializeAppUI(currentUserRole || 'user', auth.currentUser.email);
    } catch (error) {
        console.error('Erreur mise à jour mot de passe:', error);
        let message = "Impossible de mettre à jour le mot de passe.";
        if (error.code === 'auth/requires-recent-login') {
            message = "Veuillez vous reconnecter pour modifier votre mot de passe.";
        }
        showMessage(message, 'error');
    }
}

// Handler: Ajouter un magasin
async function handleAddStore(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const name = getEl('store-name').value;
    const code = getEl('store-code').value;

    try {
        await addDoc(storesCollection, { name, code });
        showMessage(`Magasin "${name}" ajouté !`, 'success');
        e.target.reset();
    } catch (error) {
        console.error("Erreur ajout magasin:", error);
        showMessage("Erreur lors de l'ajout du magasin.", "error");
    }
}

// Handler: Ajouter un appareil
async function handleAddEquipment(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const storeId = getEl('equip-store-select').value;
    const name = getEl('equip-name').value;
    const type = getEl('equip-type').value;
    const formId = getEl('equip-form-select').value;

    if (!storeId || !formId || !type || !name) {
        showMessage("Veuillez remplir tous les champs.", "error");
        return;
    }

    try {
        await addDoc(equipmentCollection, {
            storeId,
            name,
            type,
            formId
        });

        showMessage(`Appareil "${name}" ajouté !`, 'success');
        e.target.reset();
    } catch (error) {
        console.error("Erreur ajout appareil:", error);
        showMessage("Erreur lors de l'ajout de l'appareil.", "error");
    }
}

async function handleCreateUser(e) {
    e.preventDefault();
    if (!isAuthReady || currentUserRole !== 'admin') {
        showMessage("Action non autorisée.", 'error');
        return;
    }

    const firstName = getEl('create-user-first-name').value.trim();
    const lastName = getEl('create-user-last-name').value.trim();
    const email = getEl('create-user-email').value.trim().toLowerCase();
    const password = getEl('create-user-password').value;
    const role = getEl('create-user-role').value;

    if (!firstName || !lastName) {
        showMessage('Merci de renseigner le prénom et le nom.', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Le mot de passe provisoire doit contenir au moins 6 caractères.', 'error');
        return;
    }

    try {
        const adminAuth = getSecondaryAuthInstance();
        const userCredential = await createUserWithEmailAndPassword(adminAuth, email, password);
        const newUser = userCredential.user;

        const displayName = `${firstName} ${lastName}`.trim();
        await setDoc(doc(usersCollection, newUser.uid), {
            email,
            role,
            fonction: '',
            firstName,
            lastName,
            displayName,
            mustChangePassword: true,
            status: 'invited',
            createdAt: new Date(),
            createdBy: currentUserId || null
        });

        if (adminAuth.currentUser) {
            await signOut(adminAuth);
        }

        e.target.reset();
        setCreateUserFormVisibility(false);
        showMessage(`Compte créé pour ${displayName}.`, 'success');
    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        let message = "Impossible de créer cet utilisateur.";
        if (error.code === 'auth/email-already-in-use') {
            message = "Cet email est déjà associé à un compte.";
        }
        showMessage(message, 'error');
    }
}

// Handler: Clics sur la liste des magasins (délégation)
async function handleStoresListClick(e) {
    const target = e.target;
    if (!isAuthReady) return;

    const toggleBtn = target.closest('.store-toggle');
    if (toggleBtn) {
        const storeId = toggleBtn.dataset.storeId;
        if (openStoreIds.has(storeId)) {
            openStoreIds.delete(storeId);
        } else {
            openStoreIds.add(storeId);
        }
        renderStoresList();
        return;
    }

    // --- Modifier Magasin ---
    if (target.classList.contains('edit-store-btn')) {
        const storeId = target.dataset.storeId;
        const store = allStores.find(s => s.id === storeId);
        if (store) {
            getEl('edit-store-id').value = store.id;
            getEl('edit-store-name').value = store.name;
            getEl('edit-store-code').value = store.code;
            getEl('edit-store-modal').classList.remove('hidden');
        }
    }

    // --- Supprimer Magasin ---
    if (target.classList.contains('delete-store-btn')) {
        const storeId = target.dataset.storeId;
        const store = allStores.find(s => s.id === storeId);
        if (store) {
            showConfirmationModal(
                `Supprimer ${store.name} ?`,
                "Cela supprimera le magasin ET tous les appareils associés.",
                async () => {
                    try {
                        const storeRef = doc(storesCollection, storeId);
                        const storeSnapshot = await getDoc(storeRef);
                        if (!storeSnapshot.exists()) {
                            showMessage('Magasin introuvable.', 'error');
                            return;
                        }

                        const storeData = storeSnapshot.data();
                        const q = query(equipmentCollection, where("storeId", "==", storeId));
                        const querySnapshot = await getDocs(q);

                        const equipmentData = querySnapshot.docs.map(docSnap => ({
                            id: docSnap.id,
                            data: docSnap.data()
                        }));

                        const batch = writeBatch(db);
                        querySnapshot.forEach(docSnap => batch.delete(docSnap.ref));
                        batch.delete(storeRef);
                        await batch.commit();

                        openStoreIds.delete(storeId);
                        equipmentData.forEach(item => selectedEquipmentIds.delete(item.id));
                        updateBulkActionBar();

                        showMessage("Magasin et appareils supprimés.", "success", {
                            actionLabel: 'Annuler',
                            duration: 5000,
                            onAction: async () => {
                                const restoreBatch = writeBatch(db);
                                restoreBatch.set(storeRef, storeData);
                                equipmentData.forEach(item => {
                                    restoreBatch.set(doc(equipmentCollection, item.id), item.data);
                                });
                                await restoreBatch.commit();
                                showMessage('Suppression annulée.', 'success');
                            }
                        });
                    } catch (error) {
                        console.error("Erreur suppression magasin:", error);
                        showMessage("Erreur lors de la suppression.", "error");
                    }
                }
            );
        }
    }

    // --- Modifier Appareil ---
    if (target.classList.contains('edit-equip-btn')) {
        const equipId = target.dataset.equipId;
        const equip = allEquipment.find(e => e.id === equipId);
        if (equip) {
            getEl('edit-equip-id').value = equip.id;
            getEl('edit-equip-name').value = equip.name;
            getEl('edit-equip-form-select').value = equip.formId;
            getEl('edit-equip-modal').classList.remove('hidden');
        }
    }

    // --- Supprimer Appareil ---
    if (target.classList.contains('delete-equip-btn')) {
        const equipId = target.dataset.equipId;
        const equip = allEquipment.find(e => e.id === equipId);
        if (equip) {
             showConfirmationModal(
                `Supprimer ${equip.name} ?`,
                "L'appareil sera supprimé de ce magasin.",
                async () => {
                    try {
                        const equipRef = doc(equipmentCollection, equipId);
                        const snapshot = await getDoc(equipRef);
                        if (!snapshot.exists()) {
                            showMessage('Appareil introuvable.', 'error');
                            return;
                        }

                        const equipData = snapshot.data();

                        await deleteDoc(equipRef);

                        selectedEquipmentIds.delete(equipId);
                        updateBulkActionBar();

                        showMessage("Appareil supprimé.", "success", {
                            actionLabel: 'Annuler',
                            duration: 5000,
                            onAction: async () => {
                                await setDoc(equipRef, equipData);
                                showMessage('Suppression annulée.', 'success');
                            }
                        });
                    } catch (error) {
                        console.error("Erreur suppression appareil:", error);
                        showMessage("Erreur lors de la suppression.", "error");
                    }
                }
            );
        }
    }

    // --- Générer QR Code (Simple) ---
    const qrBtn = e.target.closest('.generate-qr-btn');
    if (qrBtn) {
        const data = {
            equipmentId: qrBtn.dataset.equipId,
            storeId: qrBtn.dataset.storeId,
            formId: qrBtn.dataset.formId
        };

        // NOUVEAU: Passer les noms
        generateSingleQrCode(data, qrBtn.dataset.equipName, qrBtn.dataset.storeName);
    }
}

// Handler: Soumettre l'édition de magasin
async function handleEditStore(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const storeId = getEl('edit-store-id').value;
    const newName = getEl('edit-store-name').value;
    const newCode = getEl('edit-store-code').value;

    try {
        const storeRef = doc(storesCollection, storeId);
        await updateDoc(storeRef, { name: newName, code: newCode });

        getEl('edit-store-modal').classList.add('hidden');
        showMessage("Magasin mis à jour.", "success");
    } catch (error) {
        console.error("Erreur MàJ magasin:", error);
        showMessage("Erreur lors de la mise à jour.", "error");
    }
}

// Handler: Soumettre l'édition d'appareil
async function handleEditEquipment(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const equipId = getEl('edit-equip-id').value;
    const newName = getEl('edit-equip-name').value;
    const newFormId = getEl('edit-equip-form-select').value;

    try {
        const equipRef = doc(equipmentCollection, equipId);
        await updateDoc(equipRef, {
            name: newName,
            formId: newFormId
        });

        getEl('edit-equip-modal').classList.add('hidden');
        showMessage("Appareil mis à jour.", "success");
    } catch (error) {
        console.error("Erreur MàJ appareil:", error);
        showMessage("Erreur lors de la mise à jour.", "error");
    }
}

// Handler: Clics sur la liste des formulaires (délégation)
function handleFormsListClick(e) {
    const target = e.target;
    if (!isAuthReady) return;

    const formId = target.dataset.formId;
    const form = allForms.find(f => f.id === formId);
    if (!form) return;

    // --- Modifier Formulaire ---
    if (target.classList.contains('edit-form-btn')) {
        getEl('form-builder-id').value = form.id;
        getEl('form-builder-title').value = form.title;

        const fieldsContainer = getEl('form-builder-fields');
        fieldsContainer.innerHTML = ''; // Vider les anciens

        form.fields.forEach(field => {
            addFormFieldToBuilder(fieldsContainer, field);
        });

        getEl('cancel-edit-form-btn').classList.remove('hidden');
        window.scrollTo(0, 0); // Remonter en haut de page
    }

    // --- Supprimer Formulaire ---
    if (target.classList.contains('delete-form-btn')) {
        showConfirmationModal(
            `Supprimer ${form.title} ?`,
            "Les appareils liés n'auront plus de formulaire (cela peut causer des erreurs).",
            async () => {
                try {
                    const formRef = doc(formsCollection, formId);
                    const snapshot = await getDoc(formRef);
                    if (!snapshot.exists()) {
                        showMessage('Formulaire introuvable.', 'error');
                        return;
                    }

                    const formData = snapshot.data();
                    await deleteDoc(formRef);

                    showMessage("Formulaire supprimé.", "success", {
                        actionLabel: 'Annuler',
                        duration: 5000,
                        onAction: async () => {
                            await setDoc(formRef, formData);
                            showMessage('Suppression annulée.', 'success');
                        }
                    });
                } catch (error) {
                    console.error("Erreur suppression formulaire:", error);
                    showMessage("Erreur lors de la suppression.", "error");
                }
            }
        );
    }
}

// Handler: Sauvegarder un formulaire (créer ou modifier)
async function handleSaveForm(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const formId = getEl('form-builder-id').value;
    const title = getEl('form-builder-title').value;
    const fields = [];

    document.querySelectorAll('#form-builder-fields .form-builder-field').forEach(fieldDiv => {
        const label = fieldDiv.querySelector('[data-key="label"]').value;
        const type = fieldDiv.querySelector('[data-key="type"]').value;
        const required = fieldDiv.querySelector('[data-key="required"]').checked;

        const optionInputs = fieldDiv.querySelectorAll('.option-input');
        const optionsArray = Array.from(optionInputs)
                                  .map(input => input.value.trim())
                                  .filter(opt => opt.length > 0);
        const options = optionsArray.join(',');

        if (label) {
            fields.push({ label, type, required, options });
        }
    });

    if (fields.length === 0) {
        showMessage("Un formulaire doit avoir au moins un champ.", "error");
        return;
    }

    const formData = { title, fields };
    const now = new Date();

    try {
        if (formId) {
            // Modification
            const docRef = doc(formsCollection, formId);
            await updateDoc(docRef, { ...formData, updatedAt: now });
            showMessage(`Formulaire "${title}" mis à jour !`, 'success');
        } else {
            // Création
            await addDoc(formsCollection, { ...formData, createdAt: now, updatedAt: now });
            showMessage(`Formulaire "${title}" créé !`, 'success');
        }

        resetFormBuilder();
    } catch (error) {
        console.error("Erreur sauvegarde formulaire:", error);
        showMessage("Erreur lors de la sauvegarde du formulaire.", "error");
    }
}

// Handler: Soumettre le formulaire d'intervention
async function handleSubmitIntervention(e) {
    e.preventDefault();
    if (!isAuthReady || !currentScannedData) return;

    const formData = {};
    const form = allForms.find(f => f.id === currentScannedData.formId);

    if (!form) {
        showMessage("Erreur: Formulaire de référence introuvable.", "error");
        return;
    }

    // Récupérer les données des champs dynamiques
    for (const field of form.fields) {
        const fieldName = field.label;
        const fieldId = `form-field-${fieldName.replace(/\s+/g, '-')}`;
        let value = null;
        let isRequired = field.required;

        switch (field.type) {
            case 'checkbox':
                const checkedBoxes = document.querySelectorAll(`input[name="${fieldName}"]:checked`);
                value = Array.from(checkedBoxes).map(cb => cb.value);
                if (isRequired && value.length === 0) {
                    showMessage(`Le champ "${fieldName}" est obligatoire (au moins 1 choix).`, 'error');
                    return;
                }
                break;
            case 'radio':
                const checkedRadio = document.querySelector(`input[name="${fieldName}"]:checked`);
                value = checkedRadio ? checkedRadio.value : null;
                break;
            default: // Text, Textarea, Number, Select
                const input = document.getElementById(fieldId);
                value = input ? input.value : null;
        }

        if (field.type !== 'checkbox' && isRequired && !value) {
            showMessage(`Le champ "${fieldName}" est obligatoire.`, 'error');
            return; // Arrêter la soumission
        }

        formData[fieldName] = value;
    }

    try {
        await addDoc(reportsCollection, {
            userId: currentUserId,
            userEmail: auth.currentUser.email,
            storeId: currentScannedData.storeId,
            equipmentId: currentScannedData.equipmentId,
            formId: currentScannedData.formId,
            timestamp: new Date(), 
            data: formData
        });

        showMessage("Rapport soumis avec succès !", "success");
        navigateTo('scanner'); // Retour à la page de scan
        currentScannedData = null; // Réinitialiser
        e.target.reset();
    } catch (error) {
        console.error("Erreur soumission rapport:", error);
        showMessage("Erreur lors de la soumission du rapport.", "error");
    }
}

// Handler: Clics sur la liste des utilisateurs (délégation)
async function handleUsersListClick(e) {
    if (e.target.classList.contains('toggle-user-details')) {
        const userRow = e.target.closest('.user-row');
        if (!userRow) return;

        const details = userRow.querySelector('.user-details');
        if (!details) return;

        const isHidden = details.classList.contains('hidden');
        if (isHidden) {
            details.classList.remove('hidden');
            e.target.textContent = 'Fermer';
            e.target.classList.remove('btn-secondary');
            e.target.classList.add('btn-gray');
        } else {
            details.classList.add('hidden');
            e.target.textContent = 'Modifier';
            e.target.classList.remove('btn-gray');
            if (!e.target.classList.contains('btn-secondary')) {
                e.target.classList.add('btn-secondary');
            }
        }
        return;
    }

    // Sauvegarder
    if (e.target.classList.contains('save-user-btn')) {
        const userId = e.target.dataset.userId;
        if (userId === currentUserId) return;

        const userRow = e.target.closest('.user-row');
        const newRole = userRow.querySelector('[data-key="role"]').value;
        const newFonction = userRow.querySelector('[data-key="fonction"]').value.trim();
        const newFirstName = userRow.querySelector('[data-key="firstName"]').value.trim();
        const newLastName = userRow.querySelector('[data-key="lastName"]').value.trim();
        const displayName = `${newFirstName} ${newLastName}`.trim();

        try {
            const userDocRef = doc(usersCollection, userId);
            await updateDoc(userDocRef, {
                role: newRole,
                fonction: newFonction,
                firstName: newFirstName,
                lastName: newLastName,
                displayName,
                updatedAt: new Date()
            });
            showMessage("Utilisateur mis à jour.", "success");
        } catch (error) {
             console.error("Erreur MàJ utilisateur:", error);
             showMessage("Erreur lors de la mise à jour.", "error");
        }
    }

    if (e.target.classList.contains('force-reset-btn')) {
        const userId = e.target.dataset.userId;
        if (userId === currentUserId) {
            showMessage("Impossible de vous demander une réinitialisation.", 'error');
            return;
        }

        try {
            const userDocRef = doc(usersCollection, userId);
            await updateDoc(userDocRef, {
                mustChangePassword: true,
                updatedAt: new Date()
            });
            showMessage("L'utilisateur devra changer son mot de passe à la prochaine connexion.", 'success');
        } catch (error) {
            console.error("Erreur forcer réinitialisation:", error);
            showMessage("Impossible de forcer la réinitialisation.", 'error');
        }
    }

    // Supprimer
    if (e.target.classList.contains('delete-user-btn')) {
        const userId = e.target.dataset.userId;
        if (userId === currentUserId) return;

        const userRow = e.target.closest('.user-row');
        const userEmail = userRow ? (userRow.dataset.userEmail || '') : '';

        showConfirmationModal(
            `Supprimer ${userEmail} ?`,
            "Cela supprime l'enregistrement de l'utilisateur. (Ne supprime pas l'authentification).",
            async () => {
                try {
                    const userRef = doc(usersCollection, userId);
                    const snapshot = await getDoc(userRef);
                    if (!snapshot.exists()) {
                        showMessage('Utilisateur introuvable.', 'error');
                        return;
                    }

                    const userData = snapshot.data();

                    await deleteDoc(userRef);

                    showMessage("Utilisateur supprimé de la base de données.", "success", {
                        actionLabel: 'Annuler',
                        duration: 5000,
                        onAction: async () => {
                            await setDoc(userRef, userData);
                            showMessage('Suppression annulée.', 'success');
                        }
                    });
                } catch (error) {
                    console.error("Erreur suppression utilisateur:", error);
                    showMessage("Erreur lors de la suppression.", "error");
                }
            }
        )
    }
}

// Handler: Afficher onglet admin 'Modèle'
function showAdminTabModel() {
    getEl('tab-panel-model').classList.remove('hidden');
    getEl('tab-panel-manual').classList.add('hidden');
    getEl('tab-model-btn').classList.add('border-secondary', 'text-secondary');
    getEl('tab-manual-btn').classList.remove('border-secondary', 'text-secondary');
    getEl('tab-manual-btn').classList.add('border-transparent', 'text-gray-500');
}

// Handler: Afficher onglet admin 'Manuel'
function showAdminTabManual() {
    getEl('tab-panel-model').classList.add('hidden');
    getEl('tab-panel-manual').classList.remove('hidden');
    getEl('tab-manual-btn').classList.add('border-secondary', 'text-secondary');
    getEl('tab-model-btn').classList.remove('border-secondary', 'text-secondary');
    getEl('tab-model-btn').classList.add('border-transparent', 'text-gray-500');
}

// Handler: Ajouter type d'appareil (Modèle)
async function handleAddEquipTypeModel(e) {
    e.preventDefault();
    const selected = getEl('equip-type-model-select').value;
    if (!selected) return;

    const [label, emoji] = selected.split(',');

    try {
        await addDoc(equipmentTypesCollection, { label, emoji });
        showMessage("Type d'appareil (modèle) ajouté.", "success");
    } catch (error) {
        console.error("Erreur ajout type:", error);
        showMessage("Erreur lors de l'ajout.", "error");
    }
}

// Handler: Ajouter type d'appareil (Manuel)
async function handleAddEquipTypeManual(e) {
    e.preventDefault();
    const label = getEl('equip-type-label').value;
    const emoji = getEl('equip-type-emoji').value;

    try {
        await addDoc(equipmentTypesCollection, { label, emoji });
        showMessage("Type d'appareil ajouté.", "success");
        e.target.reset();
    } catch (error) {
        console.error("Erreur ajout type:", error);
        showMessage("Erreur lors de l'ajout.", "error");
    }
}

// Handler: Clics sur la liste des types (délégation)
function handleEquipTypesListClick(e) {
    // Modifier
    if(e.target.classList.contains('edit-equip-type-btn')) {
        const typeId = e.target.dataset.typeId;
        const type = allEquipmentTypes.find(t => t.id === typeId);
        if (type) {
            getEl('edit-equip-type-id').value = type.id;
            getEl('edit-equip-type-label').value = type.label;
            getEl('edit-equip-type-emoji').value = type.emoji;
            getEl('edit-equip-type-modal').classList.remove('hidden');
        }
    }

    // Supprimer
    if(e.target.classList.contains('delete-equip-type-btn')) {
        const typeId = e.target.dataset.typeId;
        showConfirmationModal(
            "Supprimer ce type ?",
            "Assurez-vous qu'aucun appareil n'utilise ce type avant de le supprimer.",
            async () => {
                try {
                    const typeRef = doc(equipmentTypesCollection, typeId);
                    const snapshot = await getDoc(typeRef);
                    if (!snapshot.exists()) {
                        showMessage('Type introuvable.', 'error');
                        return;
                    }

                    const typeData = snapshot.data();
                    await deleteDoc(typeRef);

                    showMessage("Type supprimé.", "success", {
                        actionLabel: 'Annuler',
                        duration: 5000,
                        onAction: async () => {
                            await setDoc(typeRef, typeData);
                            showMessage('Suppression annulée.', 'success');
                        }
                    });
                } catch (error) {
                    console.error("Erreur suppression type:", error);
                    showMessage("Erreur lors de la suppression.", "error");
                }
            }
        )
    }
}

// Handler: Soumettre l'édition du type d'appareil
async function handleEditEquipType(e) {
    e.preventDefault();
    const typeId = getEl('edit-equip-type-id').value;
    const newLabel = getEl('edit-equip-type-label').value;
    const newEmoji = getEl('edit-equip-type-emoji').value;

    try {
        const typeRef = doc(equipmentTypesCollection, typeId);
        await updateDoc(typeRef, { label: newLabel, emoji: newEmoji });
        getEl('edit-equip-type-modal').classList.add('hidden');
        showMessage("Type d'appareil mis à jour.", "success");
    } catch (error) {
        console.error("Erreur MàJ type:", error);
        showMessage("Erreur lors de la mise à jour.", "error");
    }
}


// --- NOUVELLE SECTION: Actions de Masse (Bulk Actions) ---

// Gère le cochage/décochage d'un appareil
function handleEquipSelectChange(e) {
    if (!e.target.classList.contains('equip-select-checkbox')) return;

    const equipId = e.target.dataset.equipId;
    if (e.target.checked) {
        selectedEquipmentIds.add(equipId);
    } else {
        selectedEquipmentIds.delete(equipId);
    }
    updateBulkActionBar();
}

// Met à jour la barre d'actions (visible/cachée, compteur)
function updateBulkActionBar() {
    const bar = getEl('bulk-action-bar');
    const count = selectedEquipmentIds.size;

    if (count > 0) {
        getEl('bulk-action-count').textContent = count;
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }
}

// Gère le clic sur "Annuler" la sélection
function handleDeselectAll() {
    selectedEquipmentIds.clear();
    document.querySelectorAll('.equip-select-checkbox:checked').forEach(cb => {
        cb.checked = false;
    });
    updateBulkActionBar();
}

// Gère le clic sur "Imprimer QR" (Masse)
function handleBulkPrintClick() {
    const bulkItems = Array.from(selectedEquipmentIds).map(id => {
        const equip = allEquipment.find(e => e.id === id);
        if (!equip) return null;
        const store = allStores.find(s => s.id === equip.storeId);
        return {
            equipmentId: equip.id,
            storeId: equip.storeId,
            formId: equip.formId,
            equipName: equip.name || 'Appareil',
            storeName: store ? (store.name || 'Magasin') : 'Magasin inconnu'
        };
    }).filter(Boolean);

    if (bulkItems.length === 0) {
        showMessage('Sélectionnez au moins un appareil avant d\'imprimer.', 'error');
        return;
    }

    currentBulkQrData = bulkItems;
    getEl('qr-modal-content').dataset.simpleData = '';
    renderBulkQrCodes();
}

function renderBulkQrCodes() {
    if (!currentBulkQrData || currentBulkQrData.length === 0) return;

    const modalContent = getEl('qr-modal-content');
    const size = parseInt(getEl('qr-size-select').value, 10) || 256;

    modalContent.innerHTML = '';
    modalContent.className = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-2';

    getEl('qr-modal-title').textContent = `Impression de ${currentBulkQrData.length} QR Code(s)`;
    getEl('qr-modal-subtitle').classList.add('hidden');
    getEl('qr-size-select-wrapper').classList.remove('hidden');

    currentBulkQrData.forEach(item => {
        const qrDivId = `qr-bulk-${item.equipmentId}`;
        const equipNameSafe = escapeHtml(item.equipName);
        const storeNameSafe = escapeHtml(item.storeName);
        const cardHtml = `
            <div class="qr-grid-item text-center p-4 border rounded-lg break-inside-avoid">
                <h4 class="text-xl font-bold mb-2">${equipNameSafe}</h4>
                <p class="text-sm text-gray-600 mb-3">${storeNameSafe}</p>
                <div id="${qrDivId}" class="flex justify-center"></div>
            </div>
        `;
        modalContent.insertAdjacentHTML('beforeend', cardHtml);

        requestAnimationFrame(() => {
            new QRCode(document.getElementById(qrDivId), {
                text: buildDeepLinkUrl(item) || JSON.stringify({
                    equipmentId: item.equipmentId,
                    storeId: item.storeId,
                    formId: item.formId
                }),
                width: size,
                height: size,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        });
    });

    getEl('qr-modal').classList.remove('hidden');
}

// Gère le clic sur "Supprimer" (Masse)
function handleBulkDeleteClick() {
    const count = selectedEquipmentIds.size;
    showConfirmationModal(
        `Supprimer ${count} appareil(s) ?`,
        "Cette action est irréversible et supprimera tous les appareils sélectionnés.",
        async () => {
            if (!isAuthReady) return;
            try {
                const docRefs = Array.from(selectedEquipmentIds).map(id => doc(equipmentCollection, id));
                const snapshots = await Promise.all(docRefs.map(ref => getDoc(ref)));

                const equipmentData = snapshots.filter(snap => snap.exists()).map(snap => ({
                    ref: snap.ref,
                    data: snap.data()
                }));

                const batch = writeBatch(db);
                equipmentData.forEach(item => batch.delete(item.ref));
                await batch.commit();

                handleDeselectAll();

                showMessage(`${count} appareil(s) supprimé(s).`, "success", {
                    actionLabel: 'Annuler',
                    duration: 5000,
                    onAction: async () => {
                        const restoreBatch = writeBatch(db);
                        equipmentData.forEach(item => restoreBatch.set(item.ref, item.data));
                        await restoreBatch.commit();
                        showMessage('Suppression annulée.', 'success');
                    }
                });
            } catch (error) {
                console.error("Erreur suppression de masse:", error);
                showMessage("Erreur lors de la suppression.", "error");
            }
        }
    );
}

// Gère le clic sur "Dupliquer" (Masse)
function handleBulkDuplicateClick() {
    const count = selectedEquipmentIds.size;
    getEl('duplicate-count').textContent = count;
    renderDuplicateModalStores();
    getEl('duplicate-equip-modal').classList.remove('hidden');
}

// Remplit la modale de duplication avec la liste des magasins
function renderDuplicateModalStores() {
    const listContainer = getEl('duplicate-store-list');
    listContainer.innerHTML = '';

    if (allStores.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500">Aucun magasin de destination disponible.</p>';
        return;
    }

    allStores.sort((a,b) => a.name.localeCompare(b.name)).forEach(store => {
        const storeHtml = `
            <label class="flex items-center p-2 rounded-lg hover:bg-gray-100">
                <input type="checkbox" name="targetStore" value="${store.id}" class="h-4 w-4 rounded mr-2">
                <span>${store.name} (${store.code})</span>
            </label>
        `;
        listContainer.insertAdjacentHTML('beforeend', storeHtml);
    });
}

// Gère la soumission du formulaire de duplication
async function handleSubmitDuplicate(e) {
    e.preventDefault();
    if (!isAuthReady) return;

    const targetStoreIds = Array.from(document.querySelectorAll('#duplicate-store-list input[name="targetStore"]:checked'))
                              .map(cb => cb.value);

    if (targetStoreIds.length === 0) {
        showMessage("Veuillez sélectionner au moins un magasin de destination.", "error");
        return;
    }

    const itemsToDuplicate = Array.from(selectedEquipmentIds).map(id => {
        return allEquipment.find(e => e.id === id);
    }).filter(Boolean); // Filtrer les undefined

    if (itemsToDuplicate.length === 0) {
         showMessage("Aucun appareil valide à dupliquer.", "error");
         return;
    }

    try {
        const batch = writeBatch(db);

        targetStoreIds.forEach(storeId => {
            itemsToDuplicate.forEach(item => {
                // Créer une copie de l'objet, changer le storeId, supprimer l'id
                const newEquip = { ...item };
                delete newEquip.id; // Laisser Firestore générer un nouvel ID
                newEquip.storeId = storeId;

                // Créer une nouvelle référence de document
                const newDocRef = doc(collection(db, equipmentCollection.path));
                batch.set(newDocRef, newEquip);
            });
        });

        await batch.commit();

        showMessage(`Appareil(s) dupliqué(s) dans ${targetStoreIds.length} magasin(s).`, "success");
        getEl('duplicate-equip-modal').classList.add('hidden');
        handleDeselectAll();

    } catch (error) {
        console.error("Erreur duplication de masse:", error);
        showMessage("Erreur lors de la duplication.", "error");
    }
}

// --- Fin de la section Actions de Masse ---

// --- Fonctions pour le Form Builder ---
function resetFormBuilder() {
    getEl('form-builder-id').value = '';
    getEl('create-form-builder').reset();
    getEl('form-builder-fields').innerHTML = '';
    getEl('cancel-edit-form-btn').classList.add('hidden');
}

function addFormFieldToBuilder(container, fieldData = {}) {
    const fieldIndex = container.children.length + Math.random();
    const label = fieldData.label || '';
    const type = fieldData.type || 'text';
    const required = fieldData.required || false;

    const optionsArray = (fieldData.options || "").split(',').filter(opt => opt.length > 0);
    const showOptions = ['select', 'radio', 'checkbox'].includes(type);

    const optionsHtml = optionsArray.map(opt => `
        <div class="flex items-center space-x-2 option-item">
            <input type="text" class="form-field text-sm flex-1 option-input" value="${opt}">
            <button type="button" class="remove-option-btn text-danger text-lg font-bold" title="Supprimer">&times;</button>
        </div>
    `).join('');

    const fieldHtml = `
        <div class="form-builder-field border p-3 rounded-md bg-gray-50 space-y-2 relative">
            <button type="button" class="remove-field-btn absolute top-2 right-2 text-danger hover:text-red-700 font-bold text-lg" title="Supprimer ce champ">&times;</button>

            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-sm font-medium text-gray-600">Nom du champ</label>
                    <input type="text" placeholder="ex: Problème constaté" class="form-field text-sm" data-key="label" value="${label}" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-600">Type de champ</label>
                    <select class="form-field custom-select text-sm" data-key="type">
                        <option value="text" ${type === 'text' ? 'selected' : ''}>Texte (une ligne)</option>
                        <option value="textarea" ${type === 'textarea' ? 'selected' : ''}>Texte (plusieurs lignes)</option>
                        <option value="number" ${type === 'number' ? 'selected' : ''}>Nombre</option>
                        <option value="select" ${type === 'select' ? 'selected' : ''}>Liste déroulante</option>
                        <option value="radio" ${type === 'radio' ? 'selected' : ''}>Choix unique (radio)</option>
                        <option value="checkbox" ${type === 'checkbox' ? 'selected' : ''}>Choix multiples (checkbox)</option>
                    </select>
                </div>
            </div>

            <div class="options-container ${showOptions ? '' : 'hidden'} space-y-2">
                <label class="block text-sm font-medium text-gray-600">Options</label>
                <div class="options-list space-y-2">
                    ${optionsHtml}
                </div>
                <button type="button" class="add-option-btn text-sm bg-gray-200 text-gray-700 py-1 px-3 rounded-lg hover:bg-gray-300">+ Ajouter une option</button>
            </div>

            <div class="flex items-center pt-1">
                <input type="checkbox" id="required-${fieldIndex}" class="h-4 w-4 rounded" data-key="required" ${required ? 'checked' : ''}>
                <label for="required-${fieldIndex}" class="ml-2 text-sm">Obligatoire ?</label>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', fieldHtml);
}

function handleRemoveField(e) {
    e.target.closest('.form-builder-field').remove();
}

function handleAddOption(e) {
    const optionsList = e.target.previousElementSibling; // Le .options-list
    if (optionsList) {
        const optionHtml = `
        <div class="flex items-center space-x-2 option-item">
            <input type="text" class="form-field text-sm flex-1 option-input" placeholder="Nouvelle option">
            <button type="button" class="remove-option-btn text-danger text-lg font-bold" title="Supprimer">&times;</button>
        </div>`;
        optionsList.insertAdjacentHTML('beforeend', optionHtml);
    }
}

function handleRemoveOption(e) {
    e.target.closest('.option-item').remove();
}

function handleFieldTypeChange(e) {
    if (e.target.dataset.key === 'type') {
        const fieldDiv = e.target.closest('.form-builder-field');
        const optionsContainer = fieldDiv.querySelector('.options-container');
        const selectedType = e.target.value;

        if (['select', 'radio', 'checkbox'].includes(selectedType)) {
            optionsContainer.classList.remove('hidden');
        } else {
            optionsContainer.classList.add('hidden');
        }
    }
}


// --- Scanner et QR Code ---

function startScan() {
    try {
        html5QrCode = new Html5Qrcode("qr-reader");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        html5QrCode.start( { facingMode: "environment" }, config, onScanSuccess, onScanError)
        .catch(err => {
            showMessage("Impossible de démarrer la caméra.", "error");
        });

        getEl('start-scan-btn').classList.add('hidden');
        getEl('stop-scan-btn').classList.remove('hidden');
    } catch (e) {
         console.error("Erreur démarrage scanner:", e);
         showMessage("Erreur au démarrage du scanner.", "error");
    }
}

function stopScan() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.warn("Erreur à l'arrêt du scan:", err));
    }
    getEl('start-scan-btn').classList.remove('hidden');
    getEl('stop-scan-btn').classList.add('hidden');
}

function onScanSuccess(decodedText) {
    console.log(`Code scanné: ${decodedText}`);

    const data = parseQrPayload(decodedText);
    if (!data) {
        showMessage('QR code non valide.', 'error');
        return;
    }

    const opened = openInterventionFormFor(data);
    if (opened) {
        stopScan();
    }
}

function onScanError(errorMessage) {
    // Ignorer (trop verbeux)
}

// Modifié pour gérer la génération d'un *seul* QR Code
function generateSingleQrCode(data, equipName, storeName) {
    const qrDataString = buildDeepLinkUrl(data) || JSON.stringify(data);
    const qrContainer = getEl('qr-modal-content');
    const size = parseInt(getEl('qr-size-select').value) || 256;

    qrContainer.innerHTML = ''; // Nettoyer l'ancien
    qrContainer.className = 'flex justify-center flex-col items-center'; // Classe par défaut

    // Stocker les données pour le redimensionnement
    qrContainer.dataset.simpleData = JSON.stringify({ data, equipName, storeName });
    currentBulkQrData = [];

    // Afficher les contrôles du simple
    getEl('qr-size-select-wrapper').classList.remove('hidden');
    getEl('qr-modal-subtitle').classList.remove('hidden');
    getEl('qr-modal-title').textContent = "QR Code de l'Appareil"; // Titre par défaut

    // Mettre à jour le sous-titre
    getEl('qr-modal-subtitle').textContent = `Appareil: ${equipName} | Magasin: ${storeName}`;

    // Créer le div pour le QR code
    const qrDiv = document.createElement('div');

    new QRCode(qrDiv, {
        text: qrDataString,
        width: size,
        height: size,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    qrContainer.appendChild(qrDiv);

    const linkBlock = document.createElement('div');
    linkBlock.className = 'mt-4 text-sm text-gray-600 break-words text-center';
    const linkTitle = document.createElement('p');
    linkTitle.className = 'font-semibold';
    linkTitle.textContent = 'Lien direct :';
    const linkElement = document.createElement('a');
    linkElement.href = qrDataString;
    linkElement.target = '_blank';
    linkElement.rel = 'noopener';
    linkElement.className = 'text-secondary underline break-all';
    linkElement.textContent = qrDataString;
    const hint = document.createElement('p');
    hint.className = 'mt-2 text-xs text-gray-500';
    hint.textContent = "Scannez le QR code ou ouvrez ce lien avec l'appareil photo du téléphone.";
    linkBlock.append(linkTitle, linkElement, hint);
    qrContainer.appendChild(linkBlock);

    getEl('qr-modal').classList.remove('hidden');
}

// --- Modals Utilitaires ---

function showConfirmationModal(title, text, callback) {
    getEl('confirm-title').textContent = title;
    getEl('confirm-text').textContent = text;
    _confirmCallback = callback; // Stocker le callback
    getEl('confirm-modal').classList.remove('hidden');
}

function showMessage(message, type = 'error', options = {}) {
    const modal = getEl('message-modal');
    const text = getEl('message-text');
    const actionBtn = getEl('message-action-btn');
    if (!modal || !text) return;

    if (messageTimeoutId) {
        clearTimeout(messageTimeoutId);
        messageTimeoutId = null;
    }

    text.textContent = message;

    if (type === 'success') {
        modal.classList.remove('bg-red-600');
        modal.classList.add('bg-green-600');
    } else {
        modal.classList.add('bg-red-600');
        modal.classList.remove('bg-green-600');
    }

    if (actionBtn) {
        actionBtn.classList.add('hidden');
    }
    messageActionHandler = null;

    if (actionBtn && options && options.actionLabel && typeof options.onAction === 'function') {
        actionBtn.textContent = options.actionLabel;
        actionBtn.classList.remove('hidden');
        messageActionHandler = options.onAction;
    }

    modal.classList.remove('hidden');
    modal.classList.add('opacity-100');

    const duration = options && options.duration ? options.duration : 3000;
    messageTimeoutId = setTimeout(() => {
        hideMessageModal();
    }, duration);
}

function hideMessageModal() {
    const modal = getEl('message-modal');
    const actionBtn = getEl('message-action-btn');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.classList.remove('opacity-100');

    if (actionBtn) {
        actionBtn.classList.add('hidden');
    }

    if (messageTimeoutId) {
        clearTimeout(messageTimeoutId);
        messageTimeoutId = null;
    }

    messageActionHandler = null;
}

// --- Navigation et Utilitaires ---

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
}

function navigateTo(pageId) {
    hideAllPages();

    const targetPage = getEl(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    } else {
        getEl('page-scanner').classList.remove('hidden');
        pageId = 'scanner';
    }

    // Mettre à jour l'état des onglets de navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.dataset.page === pageId) {
            tab.classList.add('nav-tab-active');
            tab.classList.remove('nav-tab-inactive');
        } else {
            tab.classList.remove('nav-tab-active');
            tab.classList.add('nav-tab-inactive');
        }
    });

    if (pageId !== 'scanner' && html5QrCode && html5QrCode.isScanning) {
         stopScan();
    }
}

// Démarrage de l'application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFirebase);
} else {
    initializeFirebase();
}
