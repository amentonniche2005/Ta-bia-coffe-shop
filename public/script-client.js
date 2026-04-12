const socket = io(); 

// 1. Si le stock change
socket.on('update_stock', () => { chargerCatalogue(); });
// 2. Si une nouvelle commande arrive
socket.on('nouvelle_commande', (data) => { chargerMesCommandes(); });
// 3. Si un statut change 
socket.on('mise_a_jour_commande', () => { chargerMesCommandes(); });

// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let clientFideleVerifie = null; // 🔥 Variable globale pour stocker les infos VIP du client
const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;

// Configurations des Variantes
const variantesConfig = [
    { mots: ['gazeuse', 'soda'], options: ['Coca-Cola', 'Coca Zéro', 'Boga Cidre', 'Fanta', 'Sprite'] },
    { mots: ['cafe', 'café', 'espresso', 'capucin', 'direct'], options: ['Normal', 'Serré', 'Allongé', 'Sans Sucre'] },
    { mots: ['jus', 'citronnade', 'mojito'], options: ['Bien frais', 'Glaçons à part', 'Sans sucre ajouté'] },
    { mots: ['thé', 'the', 'infusion'], options: ['Normal', 'Léger en sucre', 'Sans sucre', 'Menthe extra'] },
    { mots: ['crêpe', 'gaufre', 'crepe'], options: ['Chocolat au lait', 'Chocolat Noir', 'Beurre salé', 'Miel'] }
];

let produitEnAttenteOption = null;

const defaultImages = {
    'cafe': 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=400&q=80',
    'the': 'https://images.unsplash.com/photo-1576092762791-dd9e2220afa1?auto=format&fit=crop&w=400&q=80',
    'boissons': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
    'dessert': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80',
    'sale': 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
};

const categoryLabels = { 'cafe': '☕ Cafés', 'the': '🫖 Thés & Infusions', 'boissons': '🍹 Boissons', 'dessert': '🍰 Pâtisseries', 'sale': '🥪 Salé & Snack', 'chicha': '💨 Chichas' };

function getClientId() {
    let id = localStorage.getItem('tabia_client_id');
    if (!id) { id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('tabia_client_id', id); }
    return id;
}

// ========== CHARGEMENT PRINCIPAL ==========
document.addEventListener("DOMContentLoaded", async () => {
    clientId = getClientId();
    
    // --- GESTION DU BOUTON ESPACE CLIENT (VIP) ---
    const btnEspace = document.getElementById('btnEspaceClient');
    if(btnEspace) {
        btnEspace.addEventListener('click', () => {
            document.getElementById('clientModal').style.display = 'flex';
            if (sessionStorage.getItem('tabia_auth_qr')) {
                document.getElementById('clientLoginCode').value = sessionStorage.getItem('tabia_auth_qr');
                // Si on a déjà vérifié le client, pas besoin de le refaire
                if (!clientFideleVerifie) verifierCodeClient(true);
            }
        });
    }

    // --- LECTURE DE L'URL (SCANS) ---
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth'); 

    // 1. Si URL contient un code Client VIP ou Table
    if (authUrl) {
        document.getElementById('clientLoginCode').value = authUrl;
        await verifierCodeClient(true); // Cette fonction fait tout : vérifie, stocke, affiche la carte VIP
        
        // Si ce n'était pas un client VIP (c'était juste un vieux code table), on le stocke quand même
        if (!clientFideleVerifie) {
            sessionStorage.setItem('tabia_auth_qr', authUrl);
        }
    } 
    // Restauration de la session si on actualise la page
    else if (sessionStorage.getItem('tabia_auth_qr')) {
        document.getElementById('clientLoginCode').value = sessionStorage.getItem('tabia_auth_qr');
        verifierCodeClient(true); 
    }

    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => { afficherNotification(`📍 Table ${tableUrl} activée`, "success"); }, 1500);
    }

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
                const isFidele = sessionStorage.getItem('client_nom_premium');
                if (!isFidele && tableData && tableData.code !== String(storedAuth)) {
                    sessionStorage.removeItem('tabia_table_qr');
                    sessionStorage.removeItem('tabia_auth_qr');
                }
            }
        } catch(e) {}
    }

    // 3. Initialisation de la boutique
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    nettoyerCommandesExpirees();
    
    if (typeof synchroniserMesCommandesAvecServeur === "function") {
        await synchroniserMesCommandesAvecServeur();
    } else {
        chargerMesCommandes();
    }
    initClientSocket();
    configurerEvenements();
});

// =================================================================
// 🔥 FONCTIONNALITÉS DU PROFIL VIP (WALLET)
// =================================================================

window.verifierCodeClient = async function(silencieux = false) {
    const code = document.getElementById('clientLoginCode').value.trim();
    if (!code) return;

    try {
        const res = await fetch(`/api/customers/verify/${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
            // Remplissage global
            clientFideleVerifie = data.customer;
            sessionStorage.setItem('tabia_auth_qr', code);
            sessionStorage.setItem('client_nom_premium', `${data.customer.prenom} ${data.customer.nom}`);

            // 1. Remplissage de la Carte VIP visuelle
            document.getElementById('vipName').innerText = `${data.customer.prenom} ${data.customer.nom}`;
            document.getElementById('vipCode').innerText = data.customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${parseFloat(data.customer.points || 0).toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = parseFloat(data.customer.solde || 0).toFixed(2) + ' DT';

            // 2. Basculer l'affichage du Modal
            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';
            
            // 3. Mettre à jour le bouton principal en haut à droite
            const btnEspace = document.getElementById('btnEspaceClient');
            if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${data.customer.prenom}`;
            
            if (!silencieux) afficherNotification(`✨ Bienvenue ${data.customer.prenom} !`, "success");
        } else {
            if (!silencieux) afficherNotification("❌ Code secret incorrect.", "error");
        }
    } catch (err) {
        if (!silencieux) afficherNotification("❌ Erreur de connexion.", "error");
    }
};

window.fermerEspaceClient = function() {
    document.getElementById('clientModal').style.display = 'none';
};

window.deconnecterClient = function() {
    sessionStorage.removeItem('tabia_auth_qr');
    sessionStorage.removeItem('client_nom_premium');
    clientFideleVerifie = null; // On vide les infos
    
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-user-circle"></i> Espace Client`;
    
    document.getElementById('clientLoginCode').value = '';
    document.getElementById('clientLoginSection').style.display = 'block';
    document.getElementById('clientProfileSection').style.display = 'none';
    
    fermerEspaceClient();
    afficherNotification("Vous êtes déconnecté.", "success");
};


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

function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    if (!grille) return;
    let produitsAffiches = produits;
    if (categorieActuelle !== "all") produitsAffiches = produits.filter(p => p.categorie === categorieActuelle);
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
        const bouton = rupture ? `<button class="add-to-cart disabled" disabled>Épuisé</button>` : `<button class="add-to-cart" onclick="gererClicAjout(${p.id})">Ajouter <i class="fas fa-plus"></i></button>`;
        const imgSrc = p.image || defaultImages[p.categorie] || defaultImages['plat'];
        
        return `
            <div class="menu-item ${classeRupture}">
                <div class="item-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center;"></div>
                <div class="item-info">
                    <div>
                        <h3>${p.nom}</h3>
                        <div class="price">${parseFloat(p.prix || 0).toFixed(2)} DT</div>
                    </div>
                    ${bouton}
                </div>
            </div>`;
    }).join('');
}

function gererClicAjout(id) {
    const produit = produits.find(p => p.id === id);
    if (!produit || (produit.stock <= 0 && produit.stock !== undefined)) return;

    if (produit.typeChoix === 'aucun') { executerAjoutPanier(produit, null); return; }

    let optionsTrouvees = null;
    if (produit.variantes && produit.variantes.trim() !== "") {
        optionsTrouvees = produit.variantes.split(',').map(v => v.trim());
    } else {
        const nomLower = (produit.nom || "").toLowerCase();
        for (let config of variantesConfig) {
            if (config.mots.some(mot => nomLower.includes(mot))) { optionsTrouvees = config.options; break; }
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
            <div class="option-box"><span>${opt}</span><i class="fas fa-check-circle check-icon"></i></div>
        </label>
    `).join('');
    
    document.getElementById("optionsList").innerHTML = listHtml;
    document.getElementById("optionsModal").style.display = "flex";
}

function executerAjoutPanier(produit, variante) {
    const cartId = variante ? `${produit.id}_${variante}` : `${produit.id}`;
    const nomAffiche = variante ? `${produit.nom} (${variante})` : produit.nom;

    if (produit.stock !== undefined) {
        const qtyPanier = panier.filter(item => item.baseId === produit.id).reduce((sum, item) => sum + item.quantite, 0);
        if (qtyPanier >= produit.stock) return afficherNotification("Désolé, stock insuffisant !", "error");
    }

    const existant = panier.find(item => item.cartId === cartId);
    if (existant) existant.quantite++;
    else panier.push({ cartId: cartId, baseId: produit.id, id: produit.id, nom: nomAffiche, variante: variante, prix: parseFloat(produit.prix), quantite: 1 });

    sauvegarderPanier(); mettreAJourUIPanier(); animerBoutonPanier();
}

function changerQuantite(cartId, delta) {
    const article = panier.find(item => item.cartId === cartId);
    if (!article) return;
    const produitDB = produits.find(p => p.id === article.baseId);
    
    if (delta > 0 && produitDB && produitDB.stock !== undefined) {
        const qtyPanier = panier.filter(item => item.baseId === article.baseId).reduce((sum, item) => sum + item.quantite, 0);
        if (qtyPanier >= produitDB.stock) return afficherNotification("Stock insuffisant", "error");
    }
        
    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(item => item.cartId !== cartId);
    
    sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier();
}

function sauvegarderPanier() { localStorage.setItem("mon_panier", JSON.stringify(panier)); }
function chargerPanier() { const p = localStorage.getItem("mon_panier"); if (p) panier = JSON.parse(p); }

function mettreAJourUIPanier() {
    const totalQty = panier.reduce((sum, item) => sum + item.quantite, 0);
    const totalPrix = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
    
    document.getElementById("conteurpanier").textContent = totalQty;
    const floatCart = document.getElementById("floatingCart");
    if (totalQty > 0) {
        floatCart.style.display = "flex"; floatCart.classList.add("visible");
        document.getElementById("floatingCartTotal").textContent = totalPrix.toFixed(2) + " DT";
    } else {
        floatCart.style.display = "none"; floatCart.classList.remove("visible");
    }
}

function animerBoutonPanier() {
    const floatCart = document.getElementById("floatingCart");
    floatCart.classList.remove("pulse"); void floatCart.offsetWidth; floatCart.classList.add("pulse");
}

function ouvrirFermerPanier() { document.getElementById("cartModal").style.display = "flex"; afficherContenuPanier(); }
function fermerPanier() { document.getElementById("cartModal").style.display = "none"; }

function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    // GESTION MAGIQUE DU MENU DÉROULANT DE PAIEMENT
    const selectPaiement = document.getElementById('methodePaiementClient');
    if (selectPaiement) {
        let optionFidelite = document.getElementById('optionFidelite');
        if (clientFideleVerifie) {
            if (!optionFidelite) {
                optionFidelite = document.createElement('option');
                optionFidelite.id = 'optionFidelite';
                optionFidelite.value = 'carte_fidelite';
                selectPaiement.appendChild(optionFidelite);
            }
            optionFidelite.textContent = `💳 Payer avec mon Solde VIP (${(clientFideleVerifie.solde || 0).toFixed(2)} DT)`;
            selectPaiement.value = 'carte_fidelite'; 
        } else {
            if (optionFidelite) optionFidelite.remove();
            selectPaiement.value = 'especes';
        }
    }

    if (panier.length === 0) {
        conteneur.innerHTML = `<div style='padding: 4rem 1rem; text-align: center; color: #94a3b8; display: flex; flex-direction: column; align-items: center;'>
            <div style="background: linear-gradient(135deg, #f8fafc, #e2e8f0); width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: inset 0 4px 10px rgba(255,255,255,0.5);">
                <i class='fas fa-shopping-bag fa-3x' style='color: #cbd5e1; transform: translateY(2px);'></i>
            </div>
            <h3 style="color: #334155; font-size: 1.3rem; font-weight: 800; margin-bottom: 8px;">Votre panier est vide</h3>
        </div>`;
        totalElement.textContent = "0.00 DT"; checkoutBtn.disabled = true; checkoutBtn.style.opacity = "0.5"; checkoutBtn.style.cursor = "not-allowed";
        return;
    }
    
    checkoutBtn.disabled = false; checkoutBtn.style.opacity = "1"; checkoutBtn.style.cursor = "pointer";

    let total = 0;
    conteneur.innerHTML = panier.map(article => {
        total += article.prix * article.quantite;
        const nomPropre = article.nom.split(' (')[0];
        const varianteHTML = article.variante ? `<div class="modern-cart-item-variant">${article.variante}</div>` : '';
        const produitBase = produits.find(p => p.id === article.baseId);
        const imgSrc = (produitBase && produitBase.image) ? produitBase.image : (produitBase ? defaultImages[produitBase.categorie] : defaultImages['cafe']);

        return `
            <div class="modern-cart-item">
                <div class="modern-cart-item-img" style="background-image: url('${imgSrc}');"></div>
                <div class="modern-cart-item-info">
                    <h4>${nomPropre}</h4>${varianteHTML}
                    <div class="modern-cart-item-price">${article.prix.toFixed(2)} DT</div>
                </div>
                <div class="modern-qty-control">
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', -1)"><i class="fas ${article.quantite === 1 ? 'fa-trash-alt' : 'fa-minus'}"></i></button>
                    <span class="modern-qty-val">${article.quantite}</span>
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', 1)"><i class="fas fa-plus"></i></button>
                </div>
            </div>`;
    }).join('');
    totalElement.textContent = `${total.toFixed(2)} DT`;
}

function passerCommande() {
    if (panier.length === 0) return;
    const tableEnMemoire = sessionStorage.getItem('tabia_table_qr');
    const authEnMemoire = sessionStorage.getItem('tabia_auth_qr');
    fermerPanier();

    if (tableEnMemoire && authEnMemoire) validerCommande(tableEnMemoire, null, authEnMemoire);
    else if (!tableEnMemoire && authEnMemoire) afficherModalTable(true, authEnMemoire); 
    else afficherModalTable(false, null); 
}

function afficherModalTable(isVip = false, authFidele = null) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
        <div id="tableModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:1rem; font-size:1.3rem;">Où êtes-vous installé ?</h3>
                <div class="table-buttons">${btns}</div>
                <button style="width:100%; background:#2c3e50; color:white; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px;" data-table="Emporter">🛍️ À Emporter</button>
                <button id="cancelTableBtn" style="width:100%; background:#e2e8f0; color:#333; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Annuler</button>
            </div>
        </div>
    `);

    const modal = document.getElementById("tableModal");
    modal.querySelector('#cancelTableBtn').onclick = () => modal.remove();
    modal.querySelectorAll('button[data-table]').forEach(btn => {
        btn.onclick = () => {
            modal.remove();
            if (isVip) validerCommande(btn.getAttribute('data-table'), clientFideleVerifie, authFidele);
            else afficherModalCode(btn.getAttribute('data-table'));
        };
    });
}

function afficherModalCode(numTable) {
    const titre = numTable === 'Emporter' ? '🛍️ À Emporter' : `Table ${numTable}`;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="codeModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:0.5rem; color: #143621;">${titre}</h3>
                <p style="font-size:0.9rem; color:#64748b;">Code de la table ou Code Fidélité</p>
                <input type="text" id="codeConfirmation" class="code-input" placeholder="•••••">
                <button id="validerCodeBtn" style="width:100%; background:#db800a; color:white; padding:1rem; border-radius:12px; font-size:1.1rem; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px;">Confirmer la commande</button>
                <button id="annulerCodeBtn" style="width:100%; background:#e2e8f0; color:#333; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Retour</button>
            </div>
        </div>
    `);

    const modal = document.getElementById("codeModal");
    const codeInput = document.getElementById("codeConfirmation");
    const validerBtn = modal.querySelector('#validerCodeBtn');
    modal.querySelector('#annulerCodeBtn').onclick = () => modal.remove();
    
    validerBtn.onclick = async () => {
        const codeSaisi = codeInput.value.trim();
        if (!codeSaisi) return afficherNotification("⚠️ Veuillez entrer un code", "error");

        validerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vérification...';
        validerBtn.disabled = true;

        let authValid = false;
        let clientData = null;

        try {
            const resFid = await fetch(`/api/customers/verify/${codeSaisi}`);
            if (resFid.ok) { const d = await resFid.json(); if(d.success) { authValid = true; clientData = d.customer; } }
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
            modal.remove(); validerCommande(numTable, clientData, codeSaisi);
        } else {
            afficherNotification("❌ Code incorrect ou expiré", "error");
            codeInput.value = ""; validerBtn.innerHTML = 'Confirmer la commande'; validerBtn.disabled = false;
        }
    };
}

async function validerCommande(numTable, clientData, codeSaisi) {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }

    try {
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let nomFidele = nomPremium || (clientData ? `${clientData.prenom} ${clientData.nom}` : null);
        let idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId;
        let tableFinale = (numTable === 'Emporter') ? 'Emporter' : parseInt(numTable);
        const totalCommande = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
        const methodeChoisie = document.getElementById('methodePaiementClient').value;
        
        const response = await fetch('/api/commandes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articles: panier.map(a => ({ id: a.baseId, nom: a.nom, variante: a.variante, prix: a.prix, quantite: a.quantite })), numeroTable: tableFinale, clientId: idFidele, codeAuth: idFidele, clientName: nomFidele, total: totalCommande, methodePaiement: methodeChoisie })
        });

        if (response.ok) {
            const commande = await response.json();
            sauvegarderCommandeClient(commande);
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier(); await chargerCatalogue();
            
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection paiement...", "success"); setTimeout(() => { window.location.href = commande.payUrl; }, 1500); return; 
            }
            
            afficherNotification(nomFidele ? `🎉 Merci ${nomFidele} ! Commande envoyée.` : "🎉 Commande envoyée avec succès !");
            if (commande.bonusInfo) setTimeout(() => afficherNotification(commande.bonusInfo, "success"), 3000);
        } else { 
            const erreurData = await response.json();
            if (response.status === 403) {
                afficherNotification("❌ " + erreurData.error, "error");
                sessionStorage.removeItem('tabia_table_qr'); sessionStorage.removeItem('tabia_auth_qr'); sessionStorage.removeItem('client_nom_premium'); 
                setTimeout(() => { window.location.reload(); }, 2500);
            } else if (response.status === 400) {
                afficherNotification("⚠️ " + erreurData.error, "error"); 
            } else { afficherNotification("❌ Erreur serveur", "error"); }
        }
    } catch (e) { afficherNotification("❌ Erreur de connexion", "error"); 
    } finally { if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.innerHTML = 'Valider la commande <i class="fas fa-arrow-right"></i>'; } }
}

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
    const valides = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if(!valides.length) { conteneur.innerHTML = `<div style='padding: 2.5rem 1rem; text-align: center; color: #94a3b8; background: white; border-radius: 20px; border: 1px dashed #cbd5e1; box-shadow: 0 4px 6px rgba(0,0,0,0.02);'><i class="fas fa-receipt fa-2x" style="opacity: 0.4; margin-bottom: 10px;"></i><p style="margin: 0; font-weight: 600;">Aucune commande en cours</p></div>`; return; }

    conteneur.innerHTML = valides.map(cmd => {
        let statusClass = 'status-attente', statusText = 'En attente', statusIcon = '<i class="fas fa-clock"></i>';
        if(cmd.statut === 'en_attente') { statusClass = 'status-attente'; statusText = 'En attente'; statusIcon = '<i class="fas fa-clock"></i>'; }
        else if(cmd.statut === 'en_preparation') { statusClass = 'status-preparation'; statusText = 'Préparation'; statusIcon = '<i class="fas fa-fire fa-beat" style="--fa-animation-duration: 1.5s;"></i>'; }
        else if(cmd.statut === 'terminee') { statusClass = 'status-termine'; statusText = 'C\'est Prêt !'; statusIcon = '<i class="fas fa-check-circle fa-bounce" style="--fa-animation-duration: 2s;"></i>'; }

        return `
            <div class="historique-commande-card">
                <div class="historique-commande-header">
                    <span class="commande-numero" style="font-size: 1.1rem;">Commande ${cmd.numero ? `#${cmd.numero}` : 'en cours...'}</span>
                    <span class="status-badge ${statusClass}" style="display:flex; align-items:center; gap:6px; padding: 6px 12px; font-size: 0.8rem;">${statusIcon} ${statusText}</span>
                </div>
                <div style="margin-bottom: 15px;">${cmd.articles.map(a => `<div class="article-detail" style="padding: 5px 0;"><span><span style="font-weight:900; color:#1e293b;">${a.quantite}x</span> ${a.nom}</span><span style="font-weight:600; color:#475569;">${(a.prix*a.quantite).toFixed(2)} DT</span></div>`).join('')}</div>
                <div style="font-weight:900; text-align:right; border-top:2px dashed #e2e8f0; padding-top:12px; margin-top:8px; color:#143621; font-size:1.3rem;">Total: ${(cmd.total || 0).toFixed(2)} DT</div>
            </div>`;
    }).join('');
}

function nettoyerCommandesExpirees() { chargerMesCommandes(); }

function initClientSocket() {
    const socket = io({ query: { clientType: 'customer' }, transports: ['websocket', 'polling'], reconnection: true });
    socket.on('mise_a_jour_commande', (commande) => {
        const key = `tabia_mes_commandes_${clientId}`;
        let hist = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = hist.findIndex(c => c.id === commande.id);
        if(idx !== -1) {
            hist[idx].statut = commande.statut;
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
            if(commande.statut === 'terminee') { afficherNotification("Votre commande est prête ! 🍽️"); }
        }
    });
}

function afficherNotification(msg, type = "success") {
    const notif = document.createElement("div");
    notif.className = `notification ${type === "error" ? "notification-error" : ""}`;
    notif.innerHTML = msg;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 3000);
}

async function synchroniserMesCommandesAvecServeur() {
    const key = `tabia_mes_commandes_${clientId}`;
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    let commandesActives = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    if (commandesActives.length === 0) { chargerMesCommandes(); return; }

    try {
        const response = await fetch(`/api/mes-commandes/${clientId}`);
        if (response.ok) {
            const vraiesCommandes = await response.json();
            hist = hist.map(cmdLocal => { const cmdServeur = vraiesCommandes.find(c => c.id === cmdLocal.id); return cmdServeur ? { ...cmdLocal, statut: cmdServeur.statut } : cmdLocal; });
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
        }
    } catch (e) { chargerMesCommandes(); }
}

function configurerEvenements() {
    document.getElementById("closeCart").onclick = fermerPanier;
    document.getElementById("checkoutBtn").onclick = passerCommande;
    document.getElementById("confirmOptionBtn")?.addEventListener("click", () => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        if (produitEnAttenteOption) {
            let valeursChoisies = "";
            if (checkedBoxes.length > 0) valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies);
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });
    document.getElementById("closeOptions")?.addEventListener("click", () => { document.getElementById("optionsModal").style.display = "none"; });
    document.getElementById("categoryTabs")?.addEventListener("click", (e) => {
        if(e.target.classList.contains("category-btn")) {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            categorieActuelle = e.target.dataset.category;
            afficherProduits();
        }
    });
    window.onclick = (e) => { if(e.target.id === 'cartModal') fermerPanier(); if(e.target.id === 'optionsModal') document.getElementById("optionsModal").style.display = "none"; }
}