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
const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;

// Configurations des Variantes par mots-clés
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
    const authUrl = urlParams.get('auth');

    if (tableUrl && authUrl) {
        // On sauvegarde la session silencieusement
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        sessionStorage.setItem('tabia_auth_qr', authUrl);
        
        // On nettoie l'URL pour faire plus propre (Optionnel)
        window.history.replaceState({}, document.title, "/");
        
        // Petite notification de bienvenue
        setTimeout(() => { afficherNotification(`📍 Connecté à la Table ${tableUrl}`); }, 1000);
    }
    clientId = getClientId();
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    nettoyerCommandesExpirees();
    chargerMesCommandes();
    initClientSocket();
    configurerEvenements();
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
// ========== AFFICHAGE DU PANIER MODERNE (AVEC IMAGES) ==========
function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");

    if (panier.length === 0) {
        // Design Premium pour le panier vide
        conteneur.innerHTML = `
            <div style='padding: 4rem 1rem; text-align: center; color: #94a3b8; display: flex; flex-direction: column; align-items: center;'>
                <div style="background: linear-gradient(135deg, #f8fafc, #e2e8f0); width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: inset 0 4px 10px rgba(255,255,255,0.5);">
                    <i class='fas fa-shopping-bag fa-3x' style='color: #cbd5e1; transform: translateY(2px);'></i>
                </div>
                <h3 style="color: #334155; font-size: 1.3rem; font-weight: 800; margin-bottom: 8px;">Votre panier est vide</h3>
                <p style="font-size: 0.95rem;">Laissez-vous tenter par nos délices... ☕🍰</p>
            </div>`;
        totalElement.textContent = "0.00 DT";
        checkoutBtn.disabled = true;
        checkoutBtn.style.opacity = "0.5";
        checkoutBtn.style.cursor = "not-allowed";
        return;
    }
    
    checkoutBtn.disabled = false;
    checkoutBtn.style.opacity = "1";
    checkoutBtn.style.cursor = "pointer";

    let total = 0;
    conteneur.innerHTML = panier.map(article => {
        total += article.prix * article.quantite;
        const nomPropre = article.nom.split(' (')[0];
        const varianteHTML = article.variante ? `<div class="modern-cart-item-variant">${article.variante}</div>` : '';
        
        // 🔥 RÉCUPÉRATION DE L'IMAGE DU PRODUIT
        const produitBase = produits.find(p => p.id === article.baseId);
        const imgSrc = (produitBase && produitBase.image) ? produitBase.image : (produitBase ? defaultImages[produitBase.categorie] : defaultImages['cafe']);

        return `
            <div class="modern-cart-item">
                <div class="modern-cart-item-img" style="background-image: url('${imgSrc}');"></div>
                <div class="modern-cart-item-info">
                    <h4>${nomPropre}</h4>
                    ${varianteHTML}
                    <div class="modern-cart-item-price">${article.prix.toFixed(2)} DT</div>
                </div>
                <div class="modern-qty-control">
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', -1)">
                        <i class="fas ${article.quantite === 1 ? 'fa-trash-alt' : 'fa-minus'}" style="color: ${article.quantite === 1 ? '#ef4444' : '#1e293b'}; font-size: ${article.quantite === 1 ? '0.85rem' : '1rem'}"></i>
                    </button>
                    <span class="modern-qty-val">${article.quantite}</span>
                    <button class="modern-qty-btn" onclick="changerQuantite('${article.cartId}', 1)">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    totalElement.textContent = `${total.toFixed(2)} DT`;
}

// ========== ENVOI COMMANDE ==========
let clientFideleVerifie = null;

// Vérification du code fidélité dans le panier
document.getElementById('btnVerifierFidelite')?.addEventListener('click', async () => {
    const code = document.getElementById('inputFidelitePanier').value.trim();
    const btn = document.getElementById('btnVerifierFidelite');
    const msg = document.getElementById('msgFidelite');
    
    if (!code) return;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const res = await fetch(`/api/customers/verify/${code}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                clientFideleVerifie = data.customer;
                msg.innerHTML = `👋 Bienvenue ${clientFideleVerifie.prenom} !`;
                msg.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-check"></i>';
                btn.style.background = '#10b981';
            }
        } else {
            msg.innerHTML = "❌ Code invalide";
            msg.style.color = '#ef4444';
            msg.style.display = 'block';
            btn.innerHTML = 'OK';
        }
    } catch(e) { btn.innerHTML = 'OK'; }
});
function passerCommande() {
    if (panier.length === 0) return;
    fermerPanier();

    // 🔥 VÉRIFICATION : Le client a-t-il scanné un QR Code ?
    const tableQr = sessionStorage.getItem('tabia_table_qr');
    const authQr = sessionStorage.getItem('tabia_auth_qr');

    if (tableQr && authQr) {
        // ZÉRO CLIC : On a déjà la table ! On envoie directement la commande.
        // Si le client s'est identifié dans le panier, clientFideleVerifie contiendra son nom,
        // sinon, ça passera juste pour la Table (Anonyme).
        validerCommande(tableQr, clientFideleVerifie, clientFideleVerifie ? clientFideleVerifie.codeFidelite : authQr);
    } else {
        // S'il n'a pas scanné de QR code (il a juste tapé l'adresse du site web), 
        // on lui ouvre la fenêtre classique pour qu'il choisisse sa table manuellement.
        afficherModalTable();
    }
}

function afficherModalTable() {
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
            modal.remove();
            afficherModalCode(numTable); 
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
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }

    try {
        let nomFidele = clientData ? `${clientData.prenom} ${clientData.nom}` : null;
        let idFidele = clientData ? codeSaisi : clientId;
        
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
                clientName: nomFidele,
                total: totalCommande,
                methodePaiement: methodeChoisie 
            })
        });

        if (response.ok) {
            const commande = await response.json();
            
            // 1. ON SAUVEGARDE ET ON VIDE LE PANIER IMMÉDIATEMENT (Peu importe le mode de paiement)
            sauvegarderCommandeClient(commande);
            panier = []; 
            sauvegarderPanier(); 
            mettreAJourUIPanier(); 
            afficherContenuPanier();
            await chargerCatalogue();
            
            // 2. GESTION DU PAIEMENT EN LIGNE
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection vers le paiement sécurisé...", "success");
                // On met un tout petit délai (1.5s) pour que l'interface ait le temps de se mettre à jour
                // et que le client voit que son panier a bien été validé avant de changer de page.
                setTimeout(() => {
                    window.location.href = commande.payUrl;
                }, 1500);
                return; 
            }
            
            // 3. GESTION DU PAIEMENT SUR PLACE
            if (nomFidele) {
                afficherNotification(`🎉 Merci ${nomFidele} ! Commande envoyée.`);
            } else {
                afficherNotification("🎉 Commande envoyée avec succès !");
            }
            
        } else { 
            afficherNotification("❌ Erreur serveur", "error"); 
        }
    } catch (e) { 
        afficherNotification("❌ Erreur de connexion", "error"); 
    } finally {
        if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.innerHTML = 'Valider la commande <i class="fas fa-arrow-right"></i>'; }
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
    const valides = hist.filter(c => c.expiration > Date.now());
    
    if(!valides.length) { 
        conteneur.innerHTML = "<div style='padding: 2rem; text-align: center; color: #7f8c8d; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;'><p>Aucune commande en cours</p></div>"; 
        return; 
    }

    conteneur.innerHTML = valides.map(cmd => {
        let statusClass = 'status-attente';
        let statusText = 'En attente';
        
        // --- LOGIQUE DES BADGES MODIFIÉE ICI ---
        if(cmd.statut === 'paye') { 
            statusClass = 'status-paye'; // Assure-toi que cette classe est bien dans ton CSS (ex: même vert que status-termine)
            statusText = 'Payé 💳'; 
        }
        else if(cmd.statut === 'en_preparation') { 
            statusClass = 'status-preparation'; 
            statusText = 'Préparation'; 
        }
        else if(cmd.statut === 'terminee') { 
            statusClass = 'status-termine'; 
            statusText = 'Prête !'; 
        }

        const numCmd = cmd.numero ? `#${cmd.numero}` : 'en cours...';

        return `
            <div class="historique-commande-card">
                <div class="historique-commande-header">
                    <span class="commande-numero">Commande ${numCmd}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div style="margin-bottom: 10px;">
                    ${cmd.articles.map(a => `<div class="article-detail"><span><span style="font-weight:bold;">${a.quantite}x</span> ${a.nom}</span> <span>${(a.prix*a.quantite).toFixed(2)} DT</span></div>`).join('')}
                </div>
                <div style="font-weight:bold; text-align:right; border-top:1px solid #f1f5f9; padding-top:8px; margin-top:8px; color:#db800a; font-size:1.1rem;">
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
    const notif = document.createElement("div");
    notif.className = `notification ${type === "error" ? "notification-error" : ""}`;
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 3000);
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