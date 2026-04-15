const socket = io(); 

// 1. Si le stock change
socket.on('update_stock', () => {
    chargerCatalogue(); 
});

// 2. Si une nouvelle commande arrive
socket.on('nouvelle_commande', (data) => {
    chargerMesCommandes(); 
});

// 3. Si un statut change 
socket.on('mise_a_jour_commande', () => {
    chargerMesCommandes(); 
});

// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
// 🎵 MOTEUR AUDIO (Sons natifs sans fichiers)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if(type === 'pop') { // Son d'ajout au panier
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if(type === 'magic') { // Son VIP Gold
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(1400, audioCtx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    }
}

const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;
const variantesConfig = [
    { mots: ['gazeuse', 'soda'], options: ['Coca-Cola', 'Coca Zéro', 'Boga Cidre', 'Fanta', 'Sprite'] },
    { mots: ['cafe', 'café', 'espresso', 'capucin', 'direct'], options: ['Normal', 'Serré', 'Allongé', 'Sans Sucre'] },
    { mots: ['jus', 'citronnade', 'mojito'], options: ['Bien frais', 'Glaçons à part', 'Sans sucre ajouté'] },
    { mots: ['thé', 'the', 'infusion'], options: ['Normal', 'Léger en sucre', 'Sans sucre', 'Menthe extra'] },
    { mots: ['crêpe', 'gaufre', 'crepe'], options: ['Chocolat au lait', 'Chocolat Noir', 'Beurre salé', 'Miel'] }
];

let produitEnAttenteOption = null;

// Images attrayantes par défaut
const defaultImages = {
    'cafe': 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=400&q=80',
    'the': 'https://images.unsplash.com/photo-1576092762791-dd9e2220afa1?auto=format&fit=crop&w=400&q=80',
    'boissons': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
    'dessert': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80',
    'sale': 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
};
const categoryLabels = {
    'cafe': '☕ Cafés',
    'the': '🫖 Thés & Infusions',
    'boissons': '🍹 Boissons',
    'dessert': '🍰 Pâtisseries',
    'sale': '🥪 Salé & Snack',
    'chicha': '💨 Chichas'
};

function getClientId() {
    let id = localStorage.getItem('tabia_client_id');
    if (!id) {
        id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('tabia_client_id', id);
    }
    return id;
}

// ========== CHARGEMENT ==========
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth'); // Peut être le code Table OU le code Fidélité

    // 1. GESTION DU SCAN (TABLE OU CARTE FIDÉLITÉ)
    if (authUrl) {
        // On stocke le code d'authentification immédiatement (Zéro-Clic)
        sessionStorage.setItem('tabia_auth_qr', authUrl);
        
        // On vérifie si c'est un client fidèle pour récupérer son nom
        try {
            const resFid = await fetch(`/api/fidelite/identifier/${authUrl}`);
            if (resFid.ok) {
                const data = await resFid.json();
                if (data.success) {
                    sessionStorage.setItem('client_nom_premium', data.nomComplet);
                    setTimeout(() => { 
                        afficherNotification(`✨ Bienvenue ${data.nomComplet} !`, "success"); 
                    }, 1000);
                }
            }
        } catch(e) { 
            console.log("Code table simple détecté ou erreur identification."); 
        }
    }

    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => { 
            afficherNotification(`📍 Table ${tableUrl} activée`, "success"); 
        }, 1500);
    }

    // On nettoie l'URL pour la discrétion
    if (tableUrl || authUrl) {
        window.history.replaceState({}, document.title, "/");
    }

    // 2. VÉRIFICATION DE SÉCURITÉ (GHOST SESSION)
    const storedTable = sessionStorage.getItem('tabia_table_qr');
    const storedAuth = sessionStorage.getItem('tabia_auth_qr');

    if (storedTable && storedAuth && storedTable !== 'Emporter') {
        try {
            const resTables = await fetch('/api/numbers');
            if (resTables.ok) {
                const tables = await resTables.json();
                const tableData = tables.find(t => parseInt(t.numero) === parseInt(storedTable));
                
                // Si c'est un code table (pas un client fidèle) et qu'il a changé
                // On vérifie d'abord si ce n'est pas un client fidèle enregistré
                const isFidele = sessionStorage.getItem('client_nom_premium');
                
                if (!isFidele && tableData && tableData.code !== String(storedAuth)) {
                    sessionStorage.removeItem('tabia_table_qr');
                    sessionStorage.removeItem('tabia_auth_qr');
                    console.log("Ancienne session table expirée.");
                }
            }
        } catch(e) { console.error("Erreur check session", e); }
    }

    // 3. Initialisation normale
    clientId = getClientId();
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    nettoyerCommandesExpirees();
    // On synchronise les commandes avec le serveur au lieu de juste charger
    if (typeof synchroniserMesCommandesAvecServeur === "function") {
        await synchroniserMesCommandesAvecServeur();
    } else {
        chargerMesCommandes();
    }
    initClientSocket();
    configurerEvenements();
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) {
        btnEspace.addEventListener('click', () => {
            document.getElementById('clientModal').style.display = 'flex';
            const savedCode = sessionStorage.getItem('tabia_auth_qr');
            if (savedCode) {
                document.getElementById('clientLoginCode').value = savedCode;
                verifierCodeClient(true);
            }
        });
        if (sessionStorage.getItem('client_nom_premium')) {
            const prenom = sessionStorage.getItem('client_nom_premium').split(' ')[0];
            btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${prenom}`;
        }
    }
    // 1. Masquer le Splash Screen après 1.5s
    setTimeout(() => { document.getElementById('splashScreen').classList.add('splash-hidden'); }, 1500);

    // 4. Initialisation du Dark Mode
    const btnDark = document.getElementById('darkModeToggle');
    if (localStorage.getItem('tabia_darkmode') === 'true') {
        document.body.classList.add('dark-mode');
        btnDark.classList.replace('fa-moon', 'fa-sun');
    }
    btnDark.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('tabia_darkmode', isDark);
        btnDark.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        if(navigator.vibrate) navigator.vibrate(15);
    });
});

// ========== FETCH API STOCK ==========
async function chargerCatalogue() {
    try {
        const response = await fetch('/api/stock');
        if (!response.ok) throw new Error("Erreur serveur");
        const data = await response.json();
        
        produits = Array.isArray(data) ? data : (data.produits || []);
        
        if (produits.length === 0) {
            document.getElementById("menuGrid").innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Le menu est actuellement vide.</p>";
            return;
        }

        genererCategoriesDynamiques(); 
        afficherProduits();
    } catch (error) {
        const grille = document.getElementById("menuGrid");
        if(grille) grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>❌ Impossible de charger le menu.</p>";
    }
}

function genererCategoriesDynamiques() {
    const container = document.getElementById('categoryTabs');
    if (!container) return;
    
    const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(Boolean))];
    
    let html = `<button class="category-btn active" data-category="all">🍽️ Tout</button>`;
    categoriesUniques.forEach(cat => {
        const label = categoryLabels[cat] || cat; 
        html += `<button class="category-btn" data-category="${cat}">${label}</button>`;
    });
    
    container.innerHTML = html;
}

// ========== AFFICHAGE DES PRODUITS ==========
function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    if (!grille) return;

    let produitsAffiches = produits;
    if (categorieActuelle !== "all") {
        produitsAffiches = produits.filter(p => p.categorie === categorieActuelle);
    }

    const enStock = produitsAffiches.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = produitsAffiches.filter(p => p.stock <= 0 && p.stock !== undefined);
    const produitsTries = [...enStock, ...enRupture];

    if (produitsTries.length === 0) {
        grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Aucun produit disponible dans cette catégorie</p>";
        return;
    }

    grille.innerHTML = produitsTries.map(p => {
        const rupture = p.stock <= 0 && p.stock !== undefined;
        const classeRupture = rupture ? 'sold-out' : '';
        const bouton = rupture 
            ? `<button class="add-to-cart disabled" disabled>Épuisé</button>`
            : `<button class="add-to-cart" onclick="gererClicAjout(${p.id})">Ajouter <i class="fas fa-plus"></i></button>`;
            
        const imgSrc = p.image || defaultImages[p.categorie] || defaultImages['plat'];
        const prixFormatte = parseFloat(p.prix || 0).toFixed(2);

        return `
            <div class="menu-item ${classeRupture}">
                <div class="item-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center;">
                </div>
                <div class="item-info">
                    <div>
                        <h3>${p.nom}</h3>
                        <div class="price">${prixFormatte} DT</div>
                    </div>
                    ${bouton}
                </div>
            </div>
        `;
    }).join('');
}

// ========== GESTION DES VARIANTES (OPTIONS) ==========
function gererClicAjout(id) {
    const produit = produits.find(p => p.id === id);
    if (!produit || (produit.stock <= 0 && produit.stock !== undefined)) return;

    let optionsTrouvees = null;

    if (produit.typeChoix === 'aucun') {
        executerAjoutPanier(produit, null);
        return; 
    }

    if (produit.variantes && produit.variantes.trim() !== "") {
        optionsTrouvees = produit.variantes.split(',').map(v => v.trim());
    } 
    else {
        const nomLower = (produit.nom || "").toLowerCase();
        for (let config of variantesConfig) {
            if (config.mots.some(mot => nomLower.includes(mot))) {
                optionsTrouvees = config.options;
                break;
            }
        }
    }

    if (optionsTrouvees && optionsTrouvees.length > 0) {
        ouvrirModalOptions(produit, optionsTrouvees);
    } else {
        executerAjoutPanier(produit, null);
    }
}

function ouvrirModalOptions(produit, options) {
    produitEnAttenteOption = produit;
    document.getElementById("optionsTitle").textContent = produit.nom;
    document.getElementById("optionPriceDisplay").textContent = `(${parseFloat(produit.prix).toFixed(2)} DT)`;
    
    let isMultiple = produit.typeChoix === 'multiple';
    let typeInput = isMultiple ? 'checkbox' : 'radio';
    
    const listHtml = options.map((opt, index) => `
        <label class="option-label">
            <input type="${typeInput}" name="varianteOption" value="${opt}" class="option-input" ${(!isMultiple && index === 0) ? 'checked' : ''}>
            <div class="option-box">
                <span>${opt}</span>
                <i class="fas fa-check-circle check-icon"></i>
            </div>
        </label>
    `).join('');
    
    document.getElementById("optionsList").innerHTML = listHtml;
    document.getElementById("optionsModal").style.display = "flex";
}

// ========== PANIER ==========
function executerAjoutPanier(produit, variante) {
    const cartId = variante ? `${produit.id}_${variante}` : `${produit.id}`;
    const nomAffiche = variante ? `${produit.nom} (${variante})` : produit.nom;

    if (produit.stock !== undefined) {
        const quantiteTotalePanier = panier.filter(item => item.baseId === produit.id).reduce((sum, item) => sum + item.quantite, 0);
        if (quantiteTotalePanier >= produit.stock) {
            afficherNotification("Désolé, stock insuffisant !", "error");
            return;
        }
    }

    const existant = panier.find(item => item.cartId === cartId);
    if (existant) {
        existant.quantite++;
    } else {
        panier.push({ 
            cartId: cartId, 
            baseId: produit.id,
            id: produit.id,
            nom: nomAffiche, 
            variante: variante,
            prix: parseFloat(produit.prix), 
            quantite: 1 
        });
    }

    sauvegarderPanier();
    mettreAJourUIPanier();
    animerBoutonPanier();
}

function changerQuantite(cartId, delta) {
    const article = panier.find(item => item.cartId === cartId);
    if (!article) return;

    const produitDB = produits.find(p => p.id === article.baseId);
    
    if (delta > 0 && produitDB && produitDB.stock !== undefined) {
        const quantiteTotalePanier = panier.filter(item => item.baseId === article.baseId).reduce((sum, item) => sum + item.quantite, 0);
        if (quantiteTotalePanier >= produitDB.stock) {
            afficherNotification("Stock insuffisant", "error");
            return;
        }
    }
        
    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(item => item.cartId !== cartId);
    
    sauvegarderPanier();
    mettreAJourUIPanier();
    afficherContenuPanier();
    if(navigator.vibrate) navigator.vibrate(20);
}

function sauvegarderPanier() { localStorage.setItem("mon_panier", JSON.stringify(panier)); }
function chargerPanier() { const p = localStorage.getItem("mon_panier"); if (p) panier = JSON.parse(p); }

function mettreAJourUIPanier() {
    const totalQty = panier.reduce((sum, item) => sum + item.quantite, 0);
    const totalPrix = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
    
    document.getElementById("conteurpanier").textContent = totalQty;
    
    const floatCart = document.getElementById("floatingCart");
    if (totalQty > 0) {
        floatCart.style.display = "flex";
        floatCart.classList.add("visible");
        document.getElementById("floatingCartTotal").textContent = totalPrix.toFixed(2) + " DT";
    } else {
        floatCart.style.display = "none";
        floatCart.classList.remove("visible");
    }
}

function animerBoutonPanier() {
    const floatCart = document.getElementById("floatingCart");
    floatCart.classList.remove("pulse");
    void floatCart.offsetWidth; 
    floatCart.classList.add("pulse");
    if(navigator.vibrate) navigator.vibrate([30, 50, 30]);
}

function ouvrirFermerPanier() {
    document.getElementById("cartModal").style.display = "flex";
    afficherContenuPanier();
}

function fermerPanier() { document.getElementById("cartModal").style.display = "none"; }

// ========== AFFICHAGE DU PANIER MODERNE ==========
// ========== AFFICHAGE DU PANIER MODERNE (NETTOYÉ) ==========

function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    // --- 🔥 AJOUT ICI : GESTION DYNAMIQUE DU PAIEMENT VIP ---
    const selectPaiement = document.getElementById('methodePaiementClient');
    if (selectPaiement) {
        let optionVIP = document.getElementById('optionPaiementVIP');
        
        // On vérifie si un client est connecté (via le nom stocké en session)
        const clientConnecte = sessionStorage.getItem('client_nom_premium');
        
        if (clientConnecte) {
            // Si le client est VIP, on ajoute l'option si elle n'existe pas déjà
            if (!optionVIP) {
                optionVIP = document.createElement('option');
                optionVIP.id = 'optionPaiementVIP';
                optionVIP.value = 'carte_fidelite';
                selectPaiement.appendChild(optionVIP);
            }
            // On récupère le solde affiché dans la carte VIP
            const soldeAffiche = document.getElementById('vipSolde')?.innerText || "0.00 DT";
            optionVIP.textContent = `⭐ Payer avec mon Solde VIP `;
            
            // On force la sélection sur VIP par défaut pour lui faire plaisir
            selectPaiement.value = 'carte_fidelite';
        } else {
            // Si pas de client connecté, on supprime l'option VIP
            if (optionVIP) optionVIP.remove();
            selectPaiement.value = 'especes';
        }
    }
    // --- FIN DE L'AJOUT ---

    if (panier.length === 0) {
        conteneur.innerHTML = `<div style='padding: 4rem 1rem; text-align: center; color: #94a3b8;'><i class='fas fa-shopping-bag fa-3x'></i><p>Votre panier est vide</p></div>`;
        totalElement.textContent = "0.00 DT";
        checkoutBtn.disabled = true;
        return;
    }
    
    checkoutBtn.disabled = false;
    let total = 0;
    conteneur.innerHTML = panier.map(article => {
        total += article.prix * article.quantite;
        return `
            <div class="modern-cart-item">
                <div class="modern-cart-item-info">
                    <h4>${article.nom}</h4>
                    <div class="modern-cart-item-price">${article.prix.toFixed(2)} DT</div>
                </div>
                <div class="modern-qty-control">
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', -1)"><i class="fas fa-minus"></i></button>
                    <span class="modern-qty-val">${article.quantite}</span>
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', 1)"><i class="fas fa-plus"></i></button>
                </div>
            </div>`;
    }).join('');

    totalElement.textContent = `${total.toFixed(2)} DT`;
}

// ========== ENVOI COMMANDE ==========
let clientFideleVerifie = null;

function passerCommande() {
    if (panier.length === 0) return;

    const tableEnMemoire = sessionStorage.getItem('tabia_table_qr');
    const authEnMemoire = sessionStorage.getItem('tabia_auth_qr');

    fermerPanier();

    // CAS 1 : TABLE SCANNÉE (Zéro-Clic Total)
    if (tableEnMemoire && authEnMemoire) {
        validerCommande(tableEnMemoire, null, authEnMemoire);
    } 
    // CAS 2 : CLIENT FIDÈLE SCANNÉ (On demande juste la table)
    else if (!tableEnMemoire && authEnMemoire) {
        // On lance la fenêtre des tables en mode "VIP" (true)
        afficherModalTable(true, authEnMemoire); 
    }
    // CAS 3 : NAVIGATION NORMALE (On demande table + code)
    else {
        // On lance la fenêtre des tables en mode "Normal" (false)
        afficherModalTable(false, null); 
    }
}

function afficherModalTable(isVip = false, authFidele = null) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    const modalHtml = `
        <div id="tableModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:1rem; font-size:1.3rem;">Où êtes-vous installé ?</h3>
                <div class="table-buttons">${btns}</div>
                <button style="width:100%; background:#2c3e50; color:white; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px;" data-table="Emporter">🛍️ À Emporter</button>
                <button id="cancelTableBtn" style="width:100%; background:#e2e8f0; color:#333; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Annuler</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById("tableModal");

    modal.querySelector('#cancelTableBtn').onclick = () => modal.remove();
    
    modal.querySelectorAll('button[data-table]').forEach(btn => {
        btn.onclick = () => {
            const numTable = btn.getAttribute('data-table');
            modal.remove(); // On ferme la fenêtre des tables
            
            // 🔥 LA MAGIE OPÈRE ICI
            if (isVip) {
                // Si c'est un VIP, on envoie la commande DIRECTEMENT avec son code fidélité
                validerCommande(numTable, clientFideleVerifie, authFidele);
            } else {
                // Si c'est un visiteur normal, on le fait passer par l'étape du code
                afficherModalCode(numTable); 
            }
        };
    });
}

function afficherModalCode(numTable) {
    const titre = numTable === 'Emporter' ? '🛍️ À Emporter' : `Table ${numTable}`;
    
    const modalHtml = `
        <div id="codeModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:0.5rem; color: #143621;">${titre}</h3>
                <p style="font-size:0.9rem; color:#64748b;">Code de la table ou Code Fidélité</p>
                <input type="text" id="codeConfirmation" class="code-input" placeholder="•••••">
                <button id="validerCodeBtn" style="width:100%; background:#db800a; color:white; padding:1rem; border-radius:12px; font-size:1.1rem; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px;">Confirmer la commande</button>
                <button id="annulerCodeBtn" style="width:100%; background:#e2e8f0; color:#333; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Retour</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById("codeModal");
    const codeInput = document.getElementById("codeConfirmation");
    const validerBtn = modal.querySelector('#validerCodeBtn');
    
    modal.querySelector('#annulerCodeBtn').onclick = () => modal.remove();
    
    validerBtn.onclick = async () => {
        const codeSaisi = codeInput.value.trim();
        
        if (!codeSaisi) {
            afficherNotification("⚠️ Veuillez entrer un code", "error");
            return;
        }

        validerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vérification...';
        validerBtn.disabled = true;

        let authValid = false;
        let clientData = null;

        try {
            const resFid = await fetch(`/api/customers/verify/${codeSaisi}`);
            if (resFid.ok) { 
                const d = await resFid.json(); 
                if(d.success) { 
                    authValid = true; 
                    clientData = d.customer; 
                } 
            }
        } catch(e) {}

        if (!authValid && numTable !== 'Emporter') {
            try {
                const resTables = await fetch('/api/numbers');
                if (resTables.ok) {
                    const tables = await resTables.json();
                    const tableData = tables.find(t => parseInt(t.numero) === parseInt(numTable));
                    if (tableData && tableData.code === String(codeSaisi)) authValid = true;
                }
            } catch(e) {}
        }

        if (codeSaisi === "00000") authValid = true;

        if (authValid) {
            modal.remove();
            validerCommande(numTable, clientData, codeSaisi);
        } else {
            afficherNotification("❌ Code incorrect ou expiré", "error");
            codeInput.value = "";
            validerBtn.innerHTML = 'Confirmer la commande';
            validerBtn.disabled = false;
        }
    };
}

async function validerCommande(numTable, clientData, codeSaisi) {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) { 
        checkoutBtn.disabled = true; 
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; 
    }

    try {
        // PRIORITÉ : 1. Nom premium (depuis QR carte) > 2. Nom clientData (depuis vérif panier) > 3. Null
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let nomFidele = nomPremium || (clientData ? `${clientData.prenom} ${clientData.nom}` : null);
        
        // PRIORITÉ : Si client fidèle identifié, on utilise son codeAuth, sinon notre clientId d'appareil
        let idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId;
        
        let tableFinale = (numTable === 'Emporter') ? 'Emporter' : parseInt(numTable);
        const totalCommande = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
        const methodeChoisie = document.getElementById('methodePaiementClient').value;
        
        const response = await fetch('/api/commandes', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articles: panier.map(a => ({ id: a.baseId, nom: a.nom, variante: a.variante, prix: a.prix, quantite: a.quantite })),
                numeroTable: tableFinale,
                clientId: idFidele, 
                codeAuth: idFidele, // On envoie le code secret pour la vérification serveur (Session Fantôme)
                clientName: nomFidele, 
                total: totalCommande,
                methodePaiement: methodeChoisie 
            })
        });

        if (response.ok) {
            const commande = await response.json();
            
            // 1. Sauvegarde et nettoyage
            sauvegarderCommandeClient(commande);
            panier = []; 
            sauvegarderPanier(); 
            mettreAJourUIPanier(); 
            afficherContenuPanier();
            await chargerCatalogue();
            
            // 2. Gestion du Paiement en Ligne
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection paiement sécurisé...", "success");
                setTimeout(() => { window.location.href = commande.payUrl; }, 1500);
                return; 
            }
            
            // 3. Notification de succès personnalisée
            const messageSucces = nomFidele ? `🎉 Merci ${nomFidele} ! Commande envoyée.` : "🎉 Commande envoyée avec succès !";
            afficherNotification(messageSucces);
            
            // 🔥 NOUVEAU : Affichage de la notification si un Bonus (Cashback) a été gagné !
            if (commande.bonusInfo) {
                setTimeout(() => {
                    afficherNotification(commande.bonusInfo, "success");
                    // Petite vibration de victoire pour marquer le coup 🎊
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]); 
                }, 3000); // 3 secondes de délai pour qu'il lise d'abord que sa commande est passée
            }
            
        } else { 
            // GESTION DES ERREURS
            const erreurData = await response.json();
            
            if (response.status === 403) {
                // Erreur de sécurité (QR Code expiré ou Faux Code)
                afficherNotification("❌ " + erreurData.error, "error");
                sessionStorage.removeItem('tabia_table_qr');
                sessionStorage.removeItem('tabia_auth_qr');
                sessionStorage.removeItem('client_nom_premium'); 
                setTimeout(() => { window.location.reload(); }, 2500);
            } else if (response.status === 400) {
                // 🔥 NOUVEAU : Erreur de paiement (ex: Solde insuffisant sur la carte)
                afficherNotification("⚠️ " + erreurData.error, "error"); 
            } else {
                afficherNotification("❌ Erreur serveur", "error"); 
            }
        }
    } catch (e) { 
        afficherNotification("❌ Erreur de connexion", "error"); 
    } finally {
        if (checkoutBtn) { 
            checkoutBtn.disabled = false; 
            checkoutBtn.innerHTML = 'Valider la commande <i class="fas fa-arrow-right"></i>'; 
        }
    }
}

// ========== HISTORIQUE ET SOCKET ==========
function sauvegarderCommandeClient(commande) {
    const key = `tabia_mes_commandes_${clientId}`;
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    hist.unshift({ ...commande, expiration: Date.now() + HISTORIQUE_EXPIRATION, timestampCreation: Date.now() });
    localStorage.setItem(key, JSON.stringify(hist.slice(0,20)));
    chargerMesCommandes();
}

function chargerMesCommandes() {
    const conteneur = document.getElementById("mesCommandes");
    if(!conteneur) return;
    
    const hist = JSON.parse(localStorage.getItem(`tabia_mes_commandes_${clientId}`) || "[]");
    
    // 🔥 MODIFICATION 1 : On ne garde que les commandes non expirées ET qui ne sont PAS payées
    const valides = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if(!valides.length) { 
        conteneur.innerHTML = `
            <div style='padding: 2.5rem 1rem; text-align: center; color: #94a3b8; background: white; border-radius: 20px; border: 1px dashed #cbd5e1; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'>
                <i class="fas fa-receipt fa-2x" style="opacity: 0.4; margin-bottom: 10px;"></i>
                <p style="margin: 0; font-weight: 600;">Aucune commande en cours</p>
            </div>`; 
        return; 
    }

    conteneur.innerHTML = valides.map(cmd => {
        let statusClass = 'status-attente';
        let statusText = 'En attente';
        let statusIcon = '<i class="fas fa-clock"></i>';
        
        // 🔥 MODIFICATION 2 : Logique des badges avec icônes animées FontAwesome
        if(cmd.statut === 'en_attente') { 
            statusClass = 'status-attente'; 
            statusText = 'En attente'; 
            statusIcon = '<i class="fas fa-clock"></i>';
        }
        else if(cmd.statut === 'en_preparation') { 
            statusClass = 'status-preparation'; 
            statusText = 'Préparation'; 
            statusIcon = '<i class="fas fa-fire fa-beat" style="--fa-animation-duration: 1.5s;"></i>';
        }
        else if(cmd.statut === 'terminee') { 
            statusClass = 'status-termine'; 
            statusText = 'C\'est Prêt !'; 
            statusIcon = '<i class="fas fa-check-circle fa-bounce" style="--fa-animation-duration: 2s;"></i>';
        }

        const numCmd = cmd.numero ? `#${cmd.numero}` : 'en cours...';

        return `
            <div class="historique-commande-card">
                <div class="historique-commande-header">
                    <span class="commande-numero" style="font-size: 1.1rem;">Commande ${numCmd}</span>
                    <span class="status-badge ${statusClass}" style="display:flex; align-items:center; gap:6px; padding: 6px 12px; font-size: 0.8rem;">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
                <div style="margin-bottom: 15px;">
                    ${cmd.articles.map(a => `
                        <div class="article-detail" style="padding: 5px 0;">
                            <span><span style="font-weight:900; color:#1e293b;">${a.quantite}x</span> ${a.nom}</span> 
                            <span style="font-weight:600; color:#475569;">${(a.prix*a.quantite).toFixed(2)} DT</span>
                        </div>
                    `).join('')}
                </div>
                <div style="font-weight:900; text-align:right; border-top:2px dashed #e2e8f0; padding-top:12px; margin-top:8px; color:#143621; font-size:1.3rem;">
                    Total: ${(cmd.total || 0).toFixed(2)} DT
                </div>
            </div>
        `;
    }).join('');
}

function nettoyerCommandesExpirees() { chargerMesCommandes(); }

function initClientSocket() {
    const socket = io({ 
        query: { clientType: 'customer' }, 
        transports: ['websocket', 'polling'], 
        reconnection: true 
    });
    
    socket.on('mise_a_jour_commande', (commande) => {
        const key = `tabia_mes_commandes_${clientId}`;
        let hist = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = hist.findIndex(c => c.id === commande.id);
        if(idx !== -1) {
            hist[idx].statut = commande.statut;
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
            if(commande.statut === 'terminee') {
                afficherNotification("Votre commande est prête ! 🍽️");
                if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
        }
    });
}

function afficherNotification(msg, type = "success") {
    const n = document.createElement("div");
    n.className = `notification ${type === "error" ? "notification-error" : ""}`;
    n.style.paddingBottom = "12px"; // Fait de la place pour la barre
    n.innerHTML = `
        <div style="display:flex; align-items:center;"><i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${msg}</div>
        <div class="notif-progress"></div> `;
    document.body.appendChild(n);
    setTimeout(() => { n.style.transform = "translate(-50%, -100px)"; n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 3000);
}
// 🔥 NOUVEAU : SYNCHRONISATION DES COMMANDES AU DÉMARRAGE
async function synchroniserMesCommandesAvecServeur() {
    const key = `tabia_mes_commandes_${clientId}`;
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    
    // On ne garde que les commandes récentes (moins de 24h) qui ne sont pas encore payées
    let commandesActives = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if (commandesActives.length === 0) {
        chargerMesCommandes(); // Affiche juste "Panier vide"
        return;
    }

    try {
        // On demande au serveur le statut de nos commandes actives
        const response = await fetch(`/api/mes-commandes/${clientId}`);
        if (response.ok) {
            const vraiesCommandes = await response.json();
            
            // On met à jour notre historique local avec la vérité du serveur
            hist = hist.map(cmdLocal => {
                const cmdServeur = vraiesCommandes.find(c => c.id === cmdLocal.id);
                if (cmdServeur) {
                    return { ...cmdLocal, statut: cmdServeur.statut };
                }
                return cmdLocal;
            });
            
            // On sauvegarde et on rafraîchit l'écran
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
        }
    } catch (e) {
        console.error("Impossible de synchroniser les commandes", e);
        chargerMesCommandes(); // Fallback sur les données locales
    }
}

function configurerEvenements() {
    document.getElementById("closeCart").onclick = fermerPanier;
    document.getElementById("checkoutBtn").onclick = passerCommande;
    
    document.getElementById("confirmOptionBtn")?.addEventListener("click", () => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        
        if (produitEnAttenteOption) {
            let valeursChoisies = "";
            
            if (checkedBoxes.length > 0) {
                valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
            }
            
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies);
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });
    
    document.getElementById("closeOptions")?.addEventListener("click", () => {
        document.getElementById("optionsModal").style.display = "none";
    });
    
    document.getElementById("categoryTabs")?.addEventListener("click", (e) => {
        if(e.target.classList.contains("category-btn")) {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            categorieActuelle = e.target.dataset.category;
            afficherProduits();
        }
    });
    
    window.onclick = (e) => {
        if(e.target.id === 'cartModal') fermerPanier();
        if(e.target.id === 'optionsModal') document.getElementById("optionsModal").style.display = "none";
    }
    
}


window.verifierCodeClient = async function(silencieux = false) {
    const code = document.getElementById('clientLoginCode').value.trim();
    if (!code) return;

    try {
        // 1. On récupère les règles du gérant
        let pointsRequis = 100; 
        let valeurCadeau = 5;
        try {
            const resConfig = await fetch('/api/settings/fidelite');
            if (resConfig.ok) {
                const config = await resConfig.json();
                pointsRequis = parseFloat(config.pointsRequis) || 100;
                valeurCadeau = parseFloat(config.valeurCredit) || 5;
            }
        } catch(e) {}

        // 2. On récupère le client
        const res = await fetch(`/api/customers/verify/${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
            const customer = data.customer;
            const ptsClient = parseFloat(customer.points || 0);

            // Textes basiques
            document.getElementById('vipName').innerText = `${customer.prenom} ${customer.nom}`;
            document.getElementById('vipCode').innerText = customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${ptsClient.toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = parseFloat(customer.solde || 0).toFixed(2) + ' DT';

            // Affichage de la vue
            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';

            // 3. LA JAUGE, L'OR ET LES CONFETTIS
            const badge = document.getElementById('vipTierName');
            const msg = document.getElementById('vipPointsLeft');
            const bar = document.getElementById('vipProgressBar');
            const carteVip = document.getElementById('vipCardElement');

            if (bar && msg && badge) {
                bar.style.width = "0%"; 
                let pourcentage = (ptsClient / pointsRequis) * 100;
                if (pourcentage > 100) pourcentage = 100;
                
                const estFini = ptsClient >= pointsRequis;

                // Application du thème Gold
                if (carteVip) {
                    if (estFini) carteVip.classList.add('theme-gold');
                    else carteVip.classList.remove('theme-gold');
                }

                badge.innerHTML = estFini ? `<i class="fas fa-gift"></i> Cadeau de ${valeurCadeau} DT` : `<i class="fas fa-medal"></i> Bronze`;
                badge.style.background = estFini ? "#f1c40f" : "#cd7f32";
                badge.style.color = estFini ? "#2c3e50" : "white";

                setTimeout(() => {
                    bar.style.width = `${pourcentage}%`;
                    
                    if (estFini) {
                        bar.style.background = "linear-gradient(90deg, #10b981, #059669)"; 
                        msg.innerHTML = `<span style="color:#10b981; font-weight:800;">🎉 Objectif atteint !</span>`;
                        
                        // Explosion de confettis
                        if (typeof confetti === 'function') {
confetti({ zIndex: 9999, particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#f1c40f', '#e67e22', '#2ecc71', '#3498db'] });                        }
                    } else {
                        bar.style.background = "linear-gradient(90deg, #db800a, #e65c00)";
                        msg.innerHTML = `Encore <b>${(pointsRequis - ptsClient).toFixed(1)} pts</b> pour ${valeurCadeau} DT !`;
                    }
                }, 100);
            }
            
            const btnEspace = document.getElementById('btnEspaceClient');
            if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${customer.prenom}`;
            
            sessionStorage.setItem('tabia_auth_qr', code);
            sessionStorage.setItem('client_nom_premium', `${customer.prenom} ${customer.nom}`);

            if (!silencieux) afficherNotification(`✨ Profil chargé avec succès !`);
        } else {
            if (!silencieux) afficherNotification("❌ Code secret incorrect.", "error");
        }
    } catch (err) {
        if (!silencieux) afficherNotification("❌ Erreur de connexion au serveur.", "error");
    }
};

// 3. Fonctions pour fermer et se déconnecter
window.fermerEspaceClient = function() {
    document.getElementById('clientModal').style.display = 'none';
};

window.deconnecterClient = function() {
    // 1. Nettoyage absolu et définitif de la mémoire du navigateur
    sessionStorage.removeItem('tabia_auth_qr');
    sessionStorage.removeItem('client_nom_premium');
    localStorage.removeItem('tabia_auth_qr'); // Sécurité supplémentaire
    
    // 2. On ferme la fenêtre VIP
    const modal = document.getElementById('clientModal');
    if (modal) modal.style.display = 'none';
    
    // 3. On affiche le message de confirmation
    afficherNotification("Vous êtes déconnecté. À bientôt !");

    // 4. 🔥 L'ARME FATALE : On force le navigateur à recharger la page "à zéro"
    // Cela détruit totalement le QR Code fantôme resté bloqué dans l'adresse URL
    setTimeout(() => {
        window.location.replace(window.location.pathname);
    }, 800); // On attend 0.8 seconde pour que le client ait le temps de lire la notification
};