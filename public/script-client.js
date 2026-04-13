/* ==========================================================================
   TA'BIA COFFEE SHOP - SCRIPT CLIENT (VERSION PREMIUM)
   ========================================================================== */

let socket = null;
try {
    if (typeof io !== 'undefined') {
        socket = io({ query: { clientType: 'customer' }, transports: ['websocket', 'polling'], reconnection: true });
        
        socket.on('update_stock', () => { chargerCatalogue(); });
        socket.on('nouvelle_commande', () => { chargerMesCommandes(); });
        socket.on('mise_a_jour_commande', () => { chargerMesCommandes(); });
    } else {
        console.warn("⚠️ Mode hors-ligne ou serveur déconnecté.");
    }
} catch (e) {}

// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let clientFideleVerifie = null; 
const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;

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
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth'); 

    // --- A. GESTION ESPACE VIP ---
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) {
        btnEspace.addEventListener('click', () => {
            document.getElementById('clientModal').style.display = 'flex';
            if (sessionStorage.getItem('tabia_auth_qr')) {
                document.getElementById('clientLoginCode').value = sessionStorage.getItem('tabia_auth_qr');
                verifierCodeClient(true);
            }
        });
    }

    if (authUrl) {
        document.getElementById('clientLoginCode').value = authUrl;
        await verifierCodeClient(true);
    } else if (sessionStorage.getItem('client_nom_premium')) {
        const prenom = sessionStorage.getItem('client_nom_premium').split(' ')[0];
        if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${prenom}`;
        if (sessionStorage.getItem('tabia_auth_qr')) {
            document.getElementById('clientLoginCode').value = sessionStorage.getItem('tabia_auth_qr');
            verifierCodeClient(true);
        }
    }

    // --- B. GESTION TABLE ---
    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => { afficherNotification(`📍 Table ${tableUrl} activée`, "success"); }, 1500);
    }
    if (tableUrl || authUrl) window.history.replaceState({}, document.title, "/");

    // --- C. INITIALISATION CATALOGUE ---
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    
    if (typeof synchroniserMesCommandesAvecServeur === "function") {
        await synchroniserMesCommandesAvecServeur();
    } else {
        chargerMesCommandes();
    }
    configurerEvenements();
});

// ========== LOGIQUE VIP (WALLET) ==========
window.verifierCodeClient = async function(silencieux = false) {
    const code = document.getElementById('clientLoginCode').value.trim();
    if (!code) return;

    try {
        const res = await fetch(`/api/customers/verify/${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
            clientFideleVerifie = data.customer;
            document.getElementById('vipName').innerText = `${data.customer.prenom} ${data.customer.nom}`;
            document.getElementById('vipCode').innerText = data.customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${parseFloat(data.customer.points || 0).toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = parseFloat(data.customer.solde || 0).toFixed(2) + ' DT';

            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';
            
            const btnEspace = document.getElementById('btnEspaceClient');
            if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${data.customer.prenom}`;
            
            sessionStorage.setItem('tabia_auth_qr', code);
            sessionStorage.setItem('client_nom_premium', `${data.customer.prenom} ${data.customer.nom}`);

            if (!silencieux) afficherNotification(`✨ Profil VIP chargé !`);
        } else {
            if (!silencieux) afficherNotification("❌ Code incorrect.", "error");
        }
    } catch (err) { }
};

window.fermerEspaceClient = function() { document.getElementById('clientModal').style.display = 'none'; };

window.deconnecterClient = function() {
    sessionStorage.removeItem('tabia_auth_qr');
    sessionStorage.removeItem('client_nom_premium');
    clientFideleVerifie = null;
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-user-circle"></i> Espace Client`;
    document.getElementById('clientLoginCode').value = '';
    document.getElementById('clientLoginSection').style.display = 'block';
    document.getElementById('clientProfileSection').style.display = 'none';
    fermerEspaceClient();
    afficherNotification("Vous êtes déconnecté.");
};

// ========== CATALOGUE & SKELETON ==========
function afficherSkeleton() {
    const grille = document.getElementById("menuGrid");
    if (!grille) return;
    grille.innerHTML = Array(6).fill(`
        <div class="skeleton-item">
            <div class="skeleton-img"></div>
            <div class="skeleton-info">
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-btn"></div>
            </div>
        </div>
    `).join('');
}

async function chargerCatalogue() {
    afficherSkeleton(); // 🔥 Lancement de l'animation
    
    try {
        const response = await fetch('/api/stock');
        if (!response.ok) throw new Error("Erreur serveur");
        const data = await response.json();
        
        produits = Array.isArray(data) ? data : (data.produits || []);
        
        if (produits.length === 0) {
            document.getElementById("menuGrid").innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Le menu est actuellement vide.</p>";
            return;
        }

        // Délai de 400ms pour montrer l'effet premium
        setTimeout(() => {
            genererCategoriesDynamiques(); 
            afficherProduits();
        }, 400);

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
        html += `<button class="category-btn" data-category="${cat}">${categoryLabels[cat] || cat}</button>`;
    });
    container.innerHTML = html;
}

function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    if (!grille) return;

    let produitsAffiches = categorieActuelle === "all" ? produits : produits.filter(p => p.categorie === categorieActuelle);
    const enStock = produitsAffiches.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = produitsAffiches.filter(p => p.stock <= 0 && p.stock !== undefined);
    const produitsTries = [...enStock, ...enRupture];

    if (produitsTries.length === 0) {
        grille.innerHTML = "<p class='empty-message'>Aucun produit disponible dans cette catégorie</p>";
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

// ========== OPTIONS ET VARIANTES ==========
window.gererClicAjout = function(id) {
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

    if (optionsTrouvees && optionsTrouvees.length > 0) ouvrirModalOptions(produit, optionsTrouvees);
    else executerAjoutPanier(produit, null);
};

function ouvrirModalOptions(produit, options) {
    produitEnAttenteOption = produit;
    document.getElementById("optionsTitle").textContent = produit.nom;
    document.getElementById("optionPriceDisplay").textContent = `(${parseFloat(produit.prix).toFixed(2)} DT)`;
    
    let isMultiple = produit.typeChoix === 'multiple';
    let typeInput = isMultiple ? 'checkbox' : 'radio';
    
    document.getElementById("optionsList").innerHTML = options.map((opt, index) => `
        <label class="option-label">
            <input type="${typeInput}" name="varianteOption" value="${opt}" class="option-input" ${(!isMultiple && index === 0) ? 'checked' : ''}>
            <div class="option-box"><span>${opt}</span><i class="fas fa-check-circle check-icon"></i></div>
        </label>
    `).join('');
    document.getElementById("optionsModal").style.display = "flex";
}

// ========== PANIER ==========
function executerAjoutPanier(produit, variante) {
    const cartId = variante ? `${produit.id}_${variante}` : `${produit.id}`;
    
    if (produit.stock !== undefined) {
        const qty = panier.filter(item => item.baseId === produit.id).reduce((sum, item) => sum + item.quantite, 0);
        if (qty >= produit.stock) return afficherNotification("Stock insuffisant !", "error");
    }

    const existant = panier.find(item => item.cartId === cartId);
    if (existant) existant.quantite++;
    else panier.push({ cartId, baseId: produit.id, id: produit.id, nom: variante ? `${produit.nom} (${variante})` : produit.nom, variante, prix: parseFloat(produit.prix), quantite: 1 });

    sauvegarderPanier(); 
    mettreAJourUIPanier(); 
    animerBoutonPanier();
    
    if(navigator.vibrate) navigator.vibrate(20); // 🔥 Vibration tactile
}

window.changerQuantite = function(cartId, delta) {
    const article = panier.find(item => item.cartId === cartId);
    if (!article) return;
    
    if (delta > 0) {
        const produitDB = produits.find(p => p.id === article.baseId);
        if (produitDB && produitDB.stock !== undefined) {
            const qty = panier.filter(item => item.baseId === article.baseId).reduce((sum, item) => sum + item.quantite, 0);
            if (qty >= produitDB.stock) return afficherNotification("Stock insuffisant", "error");
        }
    }
        
    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(item => item.cartId !== cartId);
    
    sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier();
    if(navigator.vibrate) navigator.vibrate(20);
};

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

window.ouvrirFermerPanier = function() { document.getElementById("cartModal").style.display = "flex"; afficherContenuPanier(); };
window.fermerPanier = function() { document.getElementById("cartModal").style.display = "none"; };

function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    const selectPaiement = document.getElementById('methodePaiementClient');
    if (selectPaiement) {
        let optionVIP = document.getElementById('optionPaiementVIP');
        const clientConnecte = sessionStorage.getItem('client_nom_premium');
        
        if (clientConnecte) {
            if (!optionVIP) {
                optionVIP = document.createElement('option');
                optionVIP.id = 'optionPaiementVIP';
                optionVIP.value = 'carte_fidelite';
                selectPaiement.appendChild(optionVIP);
            }
            const soldeAffiche = document.getElementById('vipSolde')?.innerText || "0.00 DT";
            optionVIP.textContent = `⭐ Payer avec mon Solde VIP (${soldeAffiche})`;
            selectPaiement.value = 'carte_fidelite';
        } else {
            if (optionVIP) optionVIP.remove();
            selectPaiement.value = 'especes';
        }
    }

    if (panier.length === 0) {
        conteneur.innerHTML = `<div style='padding:4rem 1rem; text-align:center; color:#94a3b8;'><i class='fas fa-shopping-bag fa-3x'></i><p>Votre panier est vide</p></div>`;
        totalElement.textContent = "0.00 DT"; checkoutBtn.disabled = true; return;
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
window.passerCommande = function() {
    if (panier.length === 0) return;
    const tableEnMemoire = sessionStorage.getItem('tabia_table_qr');
    const authEnMemoire = sessionStorage.getItem('tabia_auth_qr');
    fermerPanier();

    if (tableEnMemoire && authEnMemoire) validerCommande(tableEnMemoire, null, authEnMemoire);
    else if (!tableEnMemoire && authEnMemoire) afficherModalTable(true, authEnMemoire); 
    else afficherModalTable(false, null); 
};

function afficherModalTable(isVip = false, authFidele = null) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
        <div id="tableModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:1rem;">Où êtes-vous installé ?</h3>
                <div class="table-buttons">${btns}</div>
                <button style="width:100%; background:#2c3e50; color:white; padding:1rem; border-radius:12px; margin-bottom:10px;" data-table="Emporter">🛍️ À Emporter</button>
                <button id="cancelTableBtn" style="width:100%; background:#e2e8f0; padding:1rem; border-radius:12px;">Annuler</button>
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
    document.body.insertAdjacentHTML('beforeend', `
        <div id="codeModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:0.5rem; color:#143621;">${numTable === 'Emporter' ? '🛍️ À Emporter' : `Table ${numTable}`}</h3>
                <p style="color:#64748b;">Code secret</p>
                <input type="text" id="codeConfirmation" class="code-input" placeholder="••••">
                <button id="validerCodeBtn" style="width:100%; background:#db800a; color:white; padding:1rem; border-radius:12px; margin-bottom:10px;">Confirmer</button>
                <button id="annulerCodeBtn" style="width:100%; background:#e2e8f0; padding:1rem; border-radius:12px;">Retour</button>
            </div>
        </div>
    `);

    const modal = document.getElementById("codeModal");
    const validerBtn = modal.querySelector('#validerCodeBtn');
    modal.querySelector('#annulerCodeBtn').onclick = () => modal.remove();
    
    validerBtn.onclick = async () => {
        const codeSaisi = document.getElementById("codeConfirmation").value.trim();
        if (!codeSaisi) return afficherNotification("⚠️ Entrez un code", "error");

        validerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; validerBtn.disabled = true;
        let authValid = (codeSaisi === "00000"); let clientData = null;

        try {
            const resFid = await fetch(`/api/customers/verify/${codeSaisi}`);
            if (resFid.ok) { const d = await resFid.json(); if(d.success) { authValid = true; clientData = d.customer; } }
        } catch(e) {}

        if (authValid) {
            modal.remove(); validerCommande(numTable, clientData, codeSaisi);
        } else {
            afficherNotification("❌ Code incorrect", "error");
            document.getElementById("codeConfirmation").value = ""; validerBtn.innerHTML = 'Confirmer'; validerBtn.disabled = false;
        }
    };
}

async function validerCommande(numTable, clientData, codeSaisi) {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }

    try {
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        const idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId;
        const total = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
        const methodeChoisie = document.getElementById('methodePaiementClient').value;
        
        const response = await fetch('/api/commandes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articles: panier.map(a => ({ id: a.baseId, nom: a.nom, variante: a.variante, prix: a.prix, quantite: a.quantite })),
                numeroTable: numTable === 'Emporter' ? 'Emporter' : parseInt(numTable),
                clientId: idFidele, codeAuth: idFidele, clientName: nomPremium || null, total: total, methodePaiement: methodeChoisie 
            })
        });

        if (response.ok) {
            const commande = await response.json();
            sauvegarderCommandeClient(commande);
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier(); await chargerCatalogue();
            
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection...", "success"); setTimeout(() => { window.location.href = commande.payUrl; }, 1500); return; 
            }
            if(navigator.vibrate) navigator.vibrate([50, 50, 50]); // 🔥 Vibration de succès
            afficherNotification("🎉 Commande envoyée !");
        } else { 
            const erreurData = await response.json();
            afficherNotification("⚠️ " + (erreurData.error || "Erreur"), "error"); 
        }
    } catch (e) { 
        afficherNotification("❌ Erreur de connexion", "error"); 
    } finally {
        if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.innerHTML = 'Valider <i class="fas fa-arrow-right"></i>'; }
    }
}

// ========== HISTORIQUE ET TRACKER UBER EATS ==========
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
    
    if(!valides.length) { 
        conteneur.innerHTML = `<div style='padding:2rem; text-align:center; color:#94a3b8;'><i class="fas fa-receipt fa-2x"></i><p>Aucune commande en cours</p></div>`; return; 
    }

    conteneur.innerHTML = valides.map(cmd => {
        // 🔥 LA MAGIE DU TRACKER UBER EATS
        let step1 = 'active', step2 = '', step3 = '';
        let progressWidth = '0%';
        let animPrep = '', animPret = '';
        
        if (cmd.statut === 'en_preparation') { 
            step1 = 'completed'; step2 = 'active'; 
            progressWidth = '50%'; 
            animPrep = 'fa-beat'; 
        }
        else if (cmd.statut === 'terminee') { 
            step1 = 'completed'; step2 = 'completed'; step3 = 'completed'; 
            progressWidth = '100%'; 
            animPret = 'fa-bounce'; 
        }

        return `
            <div class="historique-commande-card" style="padding: 1.5rem 1rem;">
                <div class="historique-commande-header" style="border-bottom: none; padding-bottom: 0;">
                    <span class="commande-numero" style="font-size: 1.2rem;">Cmd #${cmd.numero || '...'}</span>
                    <span style="font-weight: 900; color: #143621; font-size: 1.2rem;">${(cmd.total || 0).toFixed(2)} DT</span>
                </div>
                
                <div class="order-tracker">
                    <div class="tracker-progress" style="width: ${progressWidth};"></div>
                    <div class="tracker-step ${step1}"><div class="step-icon"><i class="fas fa-file-invoice"></i></div><span class="step-label">Validée</span></div>
                    <div class="tracker-step ${step2}"><div class="step-icon"><i class="fas fa-fire ${animPrep}"></i></div><span class="step-label">En Cuisine</span></div>
                    <div class="tracker-step ${step3}"><div class="step-icon"><i class="fas fa-check ${animPret}"></i></div><span class="step-label">Prête</span></div>
                </div>

                <div style="background: #f8fafc; border-radius: 12px; padding: 12px; margin-top: 15px;">
                    ${cmd.articles.map(a => `<div class="article-detail"><span><b>${a.quantite}x</b> ${a.nom}</span></div>`).join('')}
                </div>
            </div>`;
    }).join('');
}

function nettoyerCommandesExpirees() { chargerMesCommandes(); }

async function synchroniserMesCommandesAvecServeur() {
    const key = `tabia_mes_commandes_${clientId}`;
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    let actives = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    if (actives.length === 0) return chargerMesCommandes();

    try {
        const response = await fetch(`/api/mes-commandes/${clientId}`);
        if (response.ok) {
            const vraies = await response.json();
            hist = hist.map(cmdL => { const srv = vraies.find(c => c.id === cmdL.id); return srv ? { ...cmdL, statut: srv.statut } : cmdL; });
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
        }
    } catch (e) { chargerMesCommandes(); }
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
    document.getElementById("confirmOptionBtn")?.addEventListener("click", () => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        if (produitEnAttenteOption) {
            let valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
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
    window.onclick = (e) => {
        if(e.target.id === 'cartModal') fermerPanier();
        if(e.target.id === 'optionsModal') document.getElementById("optionsModal").style.display = "none";
    }
}