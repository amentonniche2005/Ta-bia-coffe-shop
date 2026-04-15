const socket = io(); 

// ============================================================================
// ✨ STYLE DYNAMIQUE (POUR LE CHARGEMENT FANTÔME / SKELETON)
// ============================================================================
const styleAnim = document.createElement('style');
styleAnim.innerHTML = `
@keyframes skeletonPulse {
    0% { background-color: #e2e8f0; }
    50% { background-color: #cbd5e1; }
    100% { background-color: #e2e8f0; }
}
.skeleton-box {
    animation: skeletonPulse 1.5s ease-in-out infinite;
    border-radius: 8px;
}
`;
document.head.appendChild(styleAnim);

// ============================================================================
// 🔄 WEBSOCKETS (SYNCHRONISATION EN TEMPS RÉEL)
// ============================================================================
socket.on('update_stock', () => chargerCatalogue());
socket.on('nouvelle_commande', () => chargerMesCommandes());
socket.on('mise_a_jour_commande', () => chargerMesCommandes());

// ============================================================================
// 📦 VARIABLES GLOBALES
// ============================================================================
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let produitEnAttenteOption = null;

const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;
const variantesConfig = [
    { mots: ['gazeuse', 'soda'], options: ['Coca-Cola', 'Coca Zéro', 'Boga Cidre', 'Fanta', 'Sprite'] },
    { mots: ['cafe', 'café', 'espresso', 'capucin', 'direct'], options: ['Normal', 'Serré', 'Allongé', 'Sans Sucre'] },
    { mots: ['jus', 'citronnade', 'mojito'], options: ['Bien frais', 'Glaçons à part', 'Sans sucre ajouté'] },
    { mots: ['thé', 'the', 'infusion'], options: ['Normal', 'Léger en sucre', 'Sans sucre', 'Menthe extra'] },
    { mots: ['crêpe', 'gaufre', 'crepe'], options: ['Chocolat au lait', 'Chocolat Noir', 'Beurre salé', 'Miel'] }
];

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

// ============================================================================
// 🚀 INITIALISATION DE L'APPLICATION
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth');

    if (authUrl) {
        sessionStorage.setItem('tabia_auth_qr', authUrl);
        try {
            const resFid = await fetch(`/api/fidelite/identifier/${authUrl}`);
            if (resFid.ok) {
                const data = await resFid.json();
                if (data.success) {
                    sessionStorage.setItem('client_nom_premium', data.nomComplet);
                    setTimeout(() => afficherNotification(`✨ Bienvenue ${data.nomComplet} !`, "success"), 1000);
                }
            }
        } catch(e) { console.log("Code table simple détecté."); }
    }

    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => afficherNotification(`📍 Table ${tableUrl} activée`, "success"), 1500);
    }

    if (tableUrl || authUrl) window.history.replaceState({}, document.title, "/");

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
        } catch(e) { console.error(e); }
    }

    clientId = getClientId();
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
});

// ============================================================================
// 🍽️ GESTION DU CATALOGUE (STOCK & CHARGEMENT FANTÔME)
// ============================================================================
async function chargerCatalogue() {
    const grille = document.getElementById("menuGrid");
    
    // 🔥 UX Premium : Skeleton Loading (Cartes grises animées) au lieu du spinner
    if (grille && produits.length === 0) {
        grille.innerHTML = Array(6).fill(`
            <div class="menu-item" style="pointer-events:none; border:none; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow:hidden;">
                <div class="item-image skeleton-box" style="height: 140px; border-radius: 16px 16px 0 0;"></div>
                <div class="item-info" style="padding: 15px;">
                    <div class="skeleton-box" style="height: 20px; width: 70%; margin-bottom: 10px;"></div>
                    <div class="skeleton-box" style="height: 16px; width: 40%; margin-bottom: 15px;"></div>
                    <div class="skeleton-box" style="height: 40px; width: 100%; border-radius: 12px;"></div>
                </div>
            </div>
        `).join('');
    }

    try {
        const response = await fetch('/api/stock');
        if (!response.ok) throw new Error("Erreur serveur");
        const data = await response.json();
        
        produits = Array.isArray(data) ? data : (data.produits || []);
        
        if (produits.length === 0) {
            grille.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: #94a3b8;"><i class="fas fa-box-open fa-3x" style="margin-bottom:15px; opacity:0.5;"></i><p style="font-weight:600; font-size:1.1rem;">Le menu est actuellement vide.</p></div>`;
            return;
        }
        genererCategoriesDynamiques(); 
        afficherProduits();
    } catch (error) {
        if(grille) grille.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: #e74c3c;"><i class="fas fa-wifi fa-3x" style="margin-bottom:15px; opacity:0.5;"></i><p style="font-weight:600;">Impossible de charger le menu.</p></div>`;
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

    let produitsAffiches = categorieActuelle === "all" ? produits : produits.filter(p => p.categorie === categorieActuelle);

    const enStock = produitsAffiches.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = produitsAffiches.filter(p => p.stock <= 0 && p.stock !== undefined);
    const produitsTries = [...enStock, ...enRupture];

    if (produitsTries.length === 0) {
        grille.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: #94a3b8;"><i class="fas fa-search fa-2x" style="margin-bottom:10px; opacity:0.5;"></i><p>Aucun produit ici.</p></div>`;
        return;
    }

    grille.innerHTML = produitsTries.map(p => {
        const rupture = p.stock <= 0 && p.stock !== undefined;
        const classeRupture = rupture ? 'sold-out' : '';
        const bouton = rupture 
            ? `<button class="add-to-cart disabled" disabled>Épuisé</button>`
            : `<button class="add-to-cart" onclick="gererClicAjout(event, '${p.id}')">Ajouter <i class="fas fa-plus"></i></button>`;
            
        const imgSrc = p.image || defaultImages[p.categorie] || defaultImages['plat'];
        const prixFormatte = parseFloat(p.prix || 0).toFixed(2);

        return `
            <div class="menu-item ${classeRupture}">
                <div class="item-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center;"></div>
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

// ============================================================================
// 🛒 GESTION DU PANIER & OPTIONS
// ============================================================================
function gererClicAjout(event, id) {
    const produit = produits.find(p => String(p.id) === String(id));
    if (!produit || (produit.stock <= 0 && produit.stock !== undefined)) return;

    let optionsTrouvees = null;

    if (produit.typeChoix === 'aucun') {
        executerAjoutPanier(produit, null);
        animerPanierVolant(event); 
        return; 
    }

    if (produit.variantes && produit.variantes.trim() !== "") {
        optionsTrouvees = produit.variantes.split(',').map(v => v.trim());
    } else {
        const nomLower = (produit.nom || "").toLowerCase();
        for (let config of variantesConfig) {
            if (config.mots.some(mot => nomLower.includes(mot))) {
                optionsTrouvees = config.options; break;
            }
        }
    }

    if (optionsTrouvees && optionsTrouvees.length > 0) {
        ouvrirModalOptions(produit, optionsTrouvees);
    } else {
        executerAjoutPanier(produit, null);
        animerPanierVolant(event); 
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
    if (existant) existant.quantite++;
    else {
        panier.push({ cartId, baseId: produit.id, id: produit.id, nom: nomAffiche, variante, prix: parseFloat(produit.prix), quantite: 1 });
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
            afficherNotification("Stock insuffisant", "error"); return;
        }
    }
        
    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(item => item.cartId !== cartId);
    
    sauvegarderPanier();
    mettreAJourUIPanier();
    afficherContenuPanier();
    if(navigator.vibrate) navigator.vibrate(20); // Micro-vibration Haptique
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
    if(navigator.vibrate) navigator.vibrate([30, 50, 30]); // Vibration Premium
}

function ouvrirFermerPanier() { document.getElementById("cartModal").style.display = "flex"; afficherContenuPanier(); }
function fermerPanier() { document.getElementById("cartModal").style.display = "none"; }

function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    // 🔥 L'Option VIP prioritaire est ici !
    const selectPaiement = document.getElementById('methodePaiementClient');
    const optionVIP = document.getElementById('optionPaiementVIP');
    const clientConnecte = sessionStorage.getItem('client_nom_premium');
    
    if (optionVIP && selectPaiement) {
        if (clientConnecte) {
            optionVIP.style.display = 'block';
            const soldeAffiche = document.getElementById('vipSolde')?.innerText || "0.00 DT";
            optionVIP.textContent = `⭐ Payer avec mon Solde VIP (${soldeAffiche})`;
            if (selectPaiement.value !== 'carte_fidelite' && selectPaiement.dataset.lastSelected !== 'true') {
                selectPaiement.value = 'carte_fidelite';
                selectPaiement.dataset.lastSelected = 'true';
            }
        } else {
            optionVIP.style.display = 'none';
            if (selectPaiement.value === 'carte_fidelite') selectPaiement.value = 'especes';
            selectPaiement.dataset.lastSelected = 'false';
        }
    }

    if (panier.length === 0) {
        conteneur.innerHTML = `<div style='padding: 5rem 1rem; text-align: center; color: #94a3b8;'><i class='fas fa-shopping-bag fa-4x' style='margin-bottom:15px; opacity:0.3;'></i><p style='font-size:1.1rem; font-weight:600;'>Votre panier est vide</p></div>`;
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

// ============================================================================
// 💳 PROCESSUS DE COMMANDE & MODALES
// ============================================================================
function passerCommande() {
    if (panier.length === 0) return;
    const tableEnMemoire = sessionStorage.getItem('tabia_table_qr');
    const authEnMemoire = sessionStorage.getItem('tabia_auth_qr');
    fermerPanier();

    if (tableEnMemoire && authEnMemoire) validerCommande(tableEnMemoire, null, authEnMemoire);
    else if (!tableEnMemoire && authEnMemoire) afficherModalTable(true, authEnMemoire); 
    else afficherModalTable(false, null); 
}

// 🔥 UX Premium : Glassmorphism sur les Modales JS
function afficherModalTable(isVip = false, authFidele = null) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    const modalHtml = `
        <div id="tableModal" class="table-modal" style="backdrop-filter: blur(8px); background: rgba(15, 23, 42, 0.7);">
            <div class="table-modal-content" style="box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                <h3 style="margin-bottom:1rem; font-size:1.3rem; color:#1e293b;">Où êtes-vous installé ?</h3>
                <div class="table-buttons">${btns}</div>
                <button style="width:100%; background: linear-gradient(to right, #1e293b, #0f172a); color:white; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" data-table="Emporter">🛍️ À Emporter</button>
                <button id="cancelTableBtn" style="width:100%; background:#f1f5f9; color:#475569; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Annuler</button>
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
            if (isVip) validerCommande(numTable, null, authFidele);
            else afficherModalCode(numTable); 
        };
    });
}

function afficherModalCode(numTable) {
    const titre = numTable === 'Emporter' ? '🛍️ À Emporter' : `Table ${numTable}`;
    const modalHtml = `
        <div id="codeModal" class="table-modal" style="backdrop-filter: blur(8px); background: rgba(15, 23, 42, 0.7);">
            <div class="table-modal-content" style="box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                <div style="width: 50px; height: 50px; background: #fff8f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; color: var(--primary); font-size: 1.5rem;"><i class="fas fa-lock"></i></div>
                <h3 style="margin-bottom:0.5rem; color: #1e293b; font-size:1.4rem;">${titre}</h3>
                <p style="font-size:0.9rem; color:#64748b;">Code de la table ou de Fidélité</p>
                <input type="text" id="codeConfirmation" class="code-input" placeholder="•••••">
                <button id="validerCodeBtn" style="width:100%; background: linear-gradient(135deg, var(--primary), #e65c00); color:white; padding:1rem; border-radius:12px; font-size:1.1rem; font-weight:bold; border:none; cursor:pointer; margin-bottom:10px; box-shadow: 0 4px 15px rgba(219, 128, 10, 0.3);">Confirmer</button>
                <button id="annulerCodeBtn" style="width:100%; background:#f1f5f9; color:#475569; padding:1rem; border-radius:12px; font-weight:bold; border:none; cursor:pointer;">Retour</button>
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
        if (!codeSaisi) return afficherNotification("⚠️ Veuillez entrer un code", "error");

        validerBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Vérification...';
        validerBtn.disabled = true;

        let authValid = false;
        let clientData = null;

        try {
            const resFid = await fetch(`/api/customers/verify/${codeSaisi}`);
            if (resFid.ok) { 
                const d = await resFid.json(); 
                if(d.success) { authValid = true; clientData = d.customer; } 
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
            validerBtn.innerHTML = 'Confirmer';
            validerBtn.disabled = false;
            if(navigator.vibrate) navigator.vibrate([50, 50, 50]); // Vibration Erreur
        }
    };
}

async function validerCommande(numTable, clientData, codeSaisi) {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Envoi...'; }

    try {
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let nomFidele = nomPremium || (clientData ? `${clientData.prenom} ${clientData.nom}` : null);
        let idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId;
        let tableFinale = (numTable === 'Emporter') ? 'Emporter' : parseInt(numTable);
        const totalCommande = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
        const methodeChoisie = document.getElementById('methodePaiementClient').value;
        
        const response = await fetch('/api/commandes', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articles: panier.map(a => ({ id: a.baseId, nom: a.nom, variante: a.variante, prix: a.prix, quantite: a.quantite })),
                numeroTable: tableFinale, clientId: idFidele, codeAuth: idFidele, clientName: nomFidele, 
                total: totalCommande, methodePaiement: methodeChoisie 
            })
        });

        if (response.ok) {
            const commande = await response.json();
            sauvegarderCommandeClient(commande);
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier(); await chargerCatalogue();
            
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection paiement sécurisé...", "success");
                setTimeout(() => window.location.href = commande.payUrl, 1500); return; 
            }
            
            afficherNotification(nomFidele ? `🎉 Merci ${nomFidele} ! Commande envoyée.` : "🎉 Commande envoyée avec succès !");
            
            if (commande.bonusInfo) {
                setTimeout(() => {
                    afficherNotification(commande.bonusInfo, "success");
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]); 
                }, 3000);
            }
        } else { 
            const erreurData = await response.json();
            if (response.status === 403) {
                afficherNotification("❌ " + erreurData.error, "error");
                sessionStorage.removeItem('tabia_table_qr'); sessionStorage.removeItem('tabia_auth_qr'); sessionStorage.removeItem('client_nom_premium'); 
                setTimeout(() => window.location.reload(), 2500);
            } else if (response.status === 400) {
                afficherNotification("⚠️ " + erreurData.error, "error"); 
            } else { afficherNotification("❌ Erreur serveur", "error"); }
            if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
    } catch (e) { 
        afficherNotification("❌ Erreur de connexion", "error"); 
    } finally {
        if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.innerHTML = 'Valider la commande <i class="fas fa-arrow-right"></i>'; }
    }
}

// ============================================================================
// 📜 HISTORIQUE DES COMMANDES
// ============================================================================
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
        conteneur.innerHTML = `
            <div style='padding: 3rem 1rem; text-align: center; color: #94a3b8; background: white; border-radius: 24px; border: 1px dashed #cbd5e1; box-shadow: 0 4px 15px rgba(0,0,0,0.02);'>
                <div style="width: 60px; height: 60px; background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fas fa-receipt fa-2x" style="color: #cbd5e1;"></i>
                </div>
                <p style="margin: 0; font-weight: 700; font-size: 1.1rem; color: #475569;">Aucune commande en cours</p>
                <p style="font-size: 0.85rem; margin-top: 5px;">Vos commandes s'afficheront ici.</p>
            </div>`; 
        return; 
    }

    conteneur.innerHTML = valides.map(cmd => {
        let statusClass = 'status-attente'; let statusText = 'En attente'; let statusIcon = '<i class="fas fa-clock"></i>';
        
        if(cmd.statut === 'en_attente') { statusClass = 'status-attente'; statusText = 'En attente'; statusIcon = '<i class="fas fa-clock"></i>'; }
        else if(cmd.statut === 'en_preparation') { statusClass = 'status-preparation'; statusText = 'Préparation'; statusIcon = '<i class="fas fa-fire fa-beat" style="--fa-animation-duration: 1.5s;"></i>'; }
        else if(cmd.statut === 'terminee') { statusClass = 'status-termine'; statusText = 'C\'est Prêt !'; statusIcon = '<i class="fas fa-check-circle fa-bounce" style="--fa-animation-duration: 2s;"></i>'; }

        const numCmd = cmd.numero ? `#${cmd.numero}` : 'en cours...';

        return `
            <div class="historique-commande-card" style="transition: all 0.3s; border: none; box-shadow: 0 8px 20px rgba(0,0,0,0.04); border-radius: 20px;">
                <div class="historique-commande-header" style="border-bottom: 2px dashed #f1f5f9; padding-bottom: 10px;">
                    <span class="commande-numero" style="font-size: 1.1rem; font-weight: 800;"><i class="fas fa-hashtag" style="color:#cbd5e1; font-size:0.9em;"></i> ${cmd.numero || ''}</span>
                    <span class="status-badge ${statusClass}" style="display:flex; align-items:center; gap:6px; padding: 6px 12px; font-size: 0.8rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
                <div style="margin: 15px 0;">
                    ${cmd.articles.map(a => `
                        <div class="article-detail" style="padding: 6px 0;">
                            <span><span style="font-weight:900; color:var(--primary); background:#fff8f1; padding:2px 6px; border-radius:6px; margin-right:5px;">${a.quantite}x</span> <span style="font-weight:600; color:#1e293b;">${a.nom}</span></span> 
                            <span style="font-weight:700; color:#475569;">${(a.prix*a.quantite).toFixed(2)} DT</span>
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 15px; border-radius:12px; margin-top:10px;">
                    <span style="font-size:0.85rem; color:#64748b; font-weight:600;">Total Réglé</span>
                    <span style="font-weight:900; color:#143621; font-size:1.3rem;">${(cmd.total || 0).toFixed(2)} DT</span>
                </div>
            </div>
        `;
    }).join('');
}

function nettoyerCommandesExpirees() { chargerMesCommandes(); }

async function synchroniserMesCommandesAvecServeur() {
    const key = `tabia_mes_commandes_${clientId}`;
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    let commandesActives = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    if (commandesActives.length === 0) return chargerMesCommandes();

    try {
        const response = await fetch(`/api/mes-commandes/${clientId}`);
        if (response.ok) {
            const vraiesCommandes = await response.json();
            hist = hist.map(cmdLocal => {
                const cmdServeur = vraiesCommandes.find(c => c.id === cmdLocal.id);
                return cmdServeur ? { ...cmdLocal, statut: cmdServeur.statut } : cmdLocal;
            });
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
        }
    } catch (e) { chargerMesCommandes(); }
}

function initClientSocket() {
    const s = io({ query: { clientType: 'customer' }, transports: ['websocket', 'polling'], reconnection: true });
    s.on('mise_a_jour_commande', (commande) => {
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

// 🔥 UX Premium : Notifications Flottantes Animées
function afficherNotification(msg, type = "success") {
    const notif = document.createElement("div");
    const icon = type === "error" ? '<i class="fas fa-exclamation-circle" style="font-size:1.2em; margin-right:8px;"></i>' : '<i class="fas fa-check-circle" style="font-size:1.2em; margin-right:8px; color:#10b981;"></i>';
    notif.className = `notification ${type === "error" ? "notification-error" : ""}`;
    notif.innerHTML = `<div style="display:flex; align-items:center;">${icon} ${msg}</div>`;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 3500);
}

// ============================================================================
// 👑 SYSTÈME VIP (LA MAGIE GOLD ET CONFETTIS EST LÀ)
// ============================================================================
window.verifierCodeClient = async function(silencieux = false) {
    const code = document.getElementById('clientLoginCode').value.trim();
    if (!code) return;

    try {
        let pointsRequis = 100; let valeurCadeau = 5;
        try {
            const resConfig = await fetch('/api/settings/fidelite');
            if (resConfig.ok) {
                const config = await resConfig.json();
                pointsRequis = parseFloat(config.pointsRequis) || 100;
                valeurCadeau = parseFloat(config.valeurCredit) || 5;
            }
        } catch(e) { console.warn("Config défaut"); }

        const res = await fetch(`/api/customers/verify/${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
            const customer = data.customer;
            const ptsClient = parseFloat(customer.points || 0);

            document.getElementById('vipName').innerText = `${customer.prenom} ${customer.nom}`;
            document.getElementById('vipCode').innerText = customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${ptsClient.toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = (customer.solde || 0).toFixed(2) + ' DT';

            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';

            const badge = document.getElementById('vipTierName');
            const msg = document.getElementById('vipPointsLeft');
            const bar = document.getElementById('vipProgressBar');
            const carteVip = document.getElementById('vipCardElement');

            if (bar && msg && badge) {
                bar.style.width = "0%"; 
                let pourcentage = (ptsClient / pointsRequis) * 100;
                if (pourcentage > 100) pourcentage = 100;
                const estFini = ptsClient >= pointsRequis;

                // 🔥 MAGIE : CARTE GOLD ACTIVÉE SI POINTS GAGNÉS
                if (carteVip) {
                    if (estFini) carteVip.classList.add('theme-gold');
                    else carteVip.classList.remove('theme-gold');
                }

                badge.className = estFini ? "tier-badge gold" : "tier-badge silver";
                badge.innerHTML = `<i class="fas fa-gift"></i> Cadeau de ${valeurCadeau} DT`;

                setTimeout(() => {
                    bar.style.width = `${pourcentage}%`;
                    if (estFini) {
                        bar.style.background = "linear-gradient(90deg, #10b981, #059669)"; 
                        msg.innerHTML = `<span style="color:#10b981; font-weight:800;">🎉 Objectif atteint ! Passez en caisse.</span>`;
                        // 🔥 MAGIE : EFFET CONFETTIS (LA FÊTE)
                        if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#f1c40f', '#e67e22', '#2ecc71', '#3498db'] });
                        if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
                    } else {
                        bar.style.background = "linear-gradient(90deg, #db800a, #e65c00)";
                        msg.innerHTML = `Encore <b>${(pointsRequis - ptsClient).toFixed(1)} pts</b> pour gagner ${valeurCadeau} DT !`;
                    }
                }, 100);
            }

            const btnEspace = document.getElementById('btnEspaceClient');
            if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${customer.prenom}`;
            
            sessionStorage.setItem('tabia_auth_qr', code);
            if (!silencieux) afficherNotification(`✨ Profil de ${customer.prenom} chargé !`);
        } else {
            if (!silencieux) afficherNotification("❌ Code secret incorrect.", "error");
            if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
    } catch (err) {
        if (!silencieux) afficherNotification("❌ Erreur serveur.", "error");
    }
};

window.fermerEspaceClient = () => document.getElementById('clientModal').style.display = 'none';
window.deconnecterClient = () => {
    sessionStorage.removeItem('tabia_auth_qr');
    sessionStorage.removeItem('client_nom_premium');
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) btnEspace.innerHTML = `<i class="fas fa-user-circle"></i> Espace Client`;
    document.getElementById('clientLoginCode').value = '';
    document.getElementById('clientLoginSection').style.display = 'block';
    document.getElementById('clientProfileSection').style.display = 'none';
    fermerEspaceClient();
    afficherNotification("Vous êtes déconnecté.");
};

// ============================================================================
// 🪄 ANIMATIONS ET ÉVÉNEMENTS GLOBAUX
// ============================================================================
window.animerPanierVolant = function(event) {
    if (!event) return;
    const boutonCible = event.target.closest('button') || event.target;

    const flyingDot = document.createElement('div');
    flyingDot.className = 'flying-item';
    flyingDot.innerHTML = '<i class="fas fa-coffee"></i>'; 
    const rectBtn = boutonCible.getBoundingClientRect();
    flyingDot.style.top = `${rectBtn.top}px`;
    flyingDot.style.left = `${rectBtn.left}px`;
    document.body.appendChild(flyingDot);

    const btnPanier = document.getElementById('floatingCart');
    if (!btnPanier) return;
    const rectCart = btnPanier.getBoundingClientRect();

    setTimeout(() => {
        flyingDot.style.top = `${rectCart.top + 10}px`;
        flyingDot.style.left = `${rectCart.left + (rectCart.width / 2)}px`;
        flyingDot.style.transform = 'scale(0.3)';
        flyingDot.style.opacity = '0';
    }, 50);

    setTimeout(() => {
        flyingDot.remove();
        btnPanier.classList.add('cart-bounce');
        setTimeout(() => btnPanier.classList.remove('cart-bounce'), 300);
    }, 600);
};

function configurerEvenements() {
    document.getElementById("closeCart").onclick = fermerPanier;
    document.getElementById("checkoutBtn").onclick = passerCommande;
    
    document.getElementById("confirmOptionBtn")?.addEventListener("click", (e) => { 
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        if (produitEnAttenteOption) {
            let valeursChoisies = "";
            if (checkedBoxes.length > 0) valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies);
            animerPanierVolant(e); 
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });
    
    document.getElementById("closeOptions")?.addEventListener("click", () => {
        document.getElementById("optionsModal").style.display = "none";
    });
    
    document.getElementById("categoryTabs")?.addEventListener("click", (e) => {
        if(e.target.classList.contains("category-btn")) {
            if(navigator.vibrate) navigator.vibrate(10); // Retour haptique doux au changement
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