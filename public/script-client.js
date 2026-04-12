/* ==========================================================================
   TA'BIA COFFEE SHOP - SCRIPT CLIENT ULTRA-PREMIUM
   ========================================================================== */

const socket = io({ query: { clientType: 'customer' }, transports: ['websocket', 'polling'], reconnection: true });

// ========== 1. VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let clientFideleVerifie = null;
let produitEnAttenteOption = null;
const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000; // 24h

const variantesConfig = [
    { mots: ['gazeuse', 'soda'], options: ['Coca-Cola', 'Coca Zéro', 'Boga Cidre', 'Fanta', 'Sprite'] },
    { mots: ['cafe', 'café', 'espresso', 'capucin', 'direct'], options: ['Normal', 'Serré', 'Allongé', 'Sans Sucre'] },
    { mots: ['jus', 'citronnade', 'mojito'], options: ['Bien frais', 'Glaçons à part', 'Sans sucre ajouté'] },
    { mots: ['thé', 'the', 'infusion'], options: ['Normal', 'Léger en sucre', 'Sans sucre', 'Menthe extra'] },
    { mots: ['crêpe', 'gaufre', 'crepe'], options: ['Chocolat', 'Chocolat Noir', 'Beurre salé', 'Miel'] }
];

const defaultImages = {
    'cafe': 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=400&q=80',
    'the': 'https://images.unsplash.com/photo-1576092762791-dd9e2220afa1?auto=format&fit=crop&w=400&q=80',
    'boissons': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
    'dessert': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80',
    'sale': 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80'
};

const categoryLabels = { 'cafe': '☕ Cafés', 'the': '🫖 Thés & Infusions', 'boissons': '🍹 Boissons', 'dessert': '🍰 Pâtisseries', 'sale': '🥪 Salé & Snack', 'chicha': '💨 Chichas' };

// ========== 2. INITIALISATION & ÉVÉNEMENTS ==========
document.addEventListener("DOMContentLoaded", async () => {
    
    // --- Initialisation Identifiant Appareil ---
    clientId = localStorage.getItem('tabia_client_id');
    if (!clientId) {
        clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('tabia_client_id', clientId);
    }

    // --- Gestion du Thème (Dark Mode) ---
    const themeBtn = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.documentElement.style.setProperty('--transition-speed', '0.4s');
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            
            themeBtn.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
                themeBtn.style.transform = 'rotate(0deg)';
            }, 150);
            
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            if (navigator.vibrate) navigator.vibrate(10);
        });
    }

    // --- Lecture de l'URL (QR Codes) ---
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth');

    if (authUrl) {
        document.getElementById('clientLoginCode').value = authUrl;
        await verifierCodeClient(true);
    }
    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => afficherNotification(`📍 Table ${tableUrl} connectée`, "success"), 1000);
    }
    if (tableUrl || authUrl) window.history.replaceState({}, document.title, "/");

    // --- Restauration VIP Silencieuse ---
    if (!authUrl && sessionStorage.getItem('client_nom_premium')) {
        const savedCode = sessionStorage.getItem('tabia_auth_qr');
        if (savedCode) {
            document.getElementById('clientLoginCode').value = savedCode;
            verifierCodeClient(true);
        }
    }

    // --- Chargement des Données ---
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    await synchroniserMesCommandesAvecServeur();

    // --- Configuration des Clics Fixes ---
    document.getElementById("btnEspaceClient").addEventListener('click', () => document.getElementById('clientModal').style.display = 'flex');
    document.getElementById("closeCart").addEventListener('click', () => document.getElementById("cartModal").style.display = "none");
    document.getElementById("floatingCart").addEventListener('click', () => { document.getElementById("cartModal").style.display = "flex"; mettreAJourUIPanier(); });
    document.getElementById("checkoutBtn").addEventListener('click', passerCommande);
    document.getElementById("closeOptions").addEventListener('click', () => document.getElementById("optionsModal").style.display = "none");

    // Filtrage Catégories
    document.getElementById("categoryTabs").addEventListener("click", (e) => {
        if(e.target.classList.contains("category-btn")) {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            categorieActuelle = e.target.dataset.category;
            afficherProduits();
            if (navigator.vibrate) navigator.vibrate(15);
        }
    });

    // Validation Options
    document.getElementById("confirmOptionBtn").addEventListener("click", () => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        if (produitEnAttenteOption) {
            let valeursChoisies = checkedBoxes.length > 0 ? Array.from(checkedBoxes).map(cb => cb.value).join(', ') : "";
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies);
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });

    // Fermeture des modales au clic extérieur
    window.onclick = (e) => {
        if(e.target.classList.contains('cart-modal') || e.target.classList.contains('options-modal') || e.target.classList.contains('table-modal')) {
            e.target.style.display = "none";
        }
    }

    // Sockets
    socket.on('update_stock', chargerCatalogue);
    socket.on('nouvelle_commande', chargerMesCommandes);
    socket.on('mise_a_jour_commande', (cmd) => {
        const key = `tabia_mes_commandes_${clientId}`;
        let hist = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = hist.findIndex(c => c.id === cmd.id);
        if(idx !== -1) {
            hist[idx].statut = cmd.statut;
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandes();
            if(cmd.statut === 'terminee') {
                afficherNotification("🎉 Votre commande est prête !", "success");
                if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
        }
    });
});

// ========== 3. ESPACE CLIENT VIP ==========
window.verifierCodeClient = async function(silencieux = false) {
    const code = document.getElementById('clientLoginCode').value.trim();
    if (!code) return;

    try {
        const res = await fetch(`/api/customers/verify/${code}`);
        const data = await res.json();

        if (res.ok && data.success) {
            clientFideleVerifie = data.customer;
            sessionStorage.setItem('tabia_auth_qr', code);
            sessionStorage.setItem('client_nom_premium', `${data.customer.prenom} ${data.customer.nom}`);
            
            // MAJ UI VIP
            document.getElementById('vipName').innerText = `${data.customer.prenom} ${data.customer.nom}`;
            document.getElementById('vipCode').innerText = data.customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${parseFloat(data.customer.points || 0).toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = parseFloat(data.customer.solde || 0).toFixed(2) + ' DT';

            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';
            document.getElementById('btnEspaceClient').innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${data.customer.prenom}`;
            
            mettreAJourUIPanier(); 
            
            if (!silencieux) {
                afficherNotification(`✨ Bienvenue ${data.customer.prenom} !`, "success");
                if (navigator.vibrate) navigator.vibrate(30);
            }
        } else {
            if (!silencieux) afficherNotification("Code secret incorrect.", "error");
        }
    } catch (err) { }
};

window.fermerEspaceClient = function() { document.getElementById('clientModal').style.display = 'none'; };

window.deconnecterClient = function() {
    sessionStorage.removeItem('tabia_auth_qr');
    sessionStorage.removeItem('client_nom_premium');
    clientFideleVerifie = null;
    
    document.getElementById('btnEspaceClient').innerHTML = `<i class="fas fa-user-circle"></i> Espace VIP`;
    document.getElementById('clientLoginCode').value = '';
    document.getElementById('clientLoginSection').style.display = 'block';
    document.getElementById('clientProfileSection').style.display = 'none';
    
    mettreAJourUIPanier();
    fermerEspaceClient();
    afficherNotification("Vous êtes déconnecté.");
};

// ========== 4. CATALOGUE & PRODUITS ==========
async function chargerCatalogue() {
    try {
        const response = await fetch('/api/stock');
        const data = await response.json();
        produits = Array.isArray(data) ? data : [];
        
        if (produits.length === 0) {
            document.getElementById("menuGrid").innerHTML = "<div class='empty-cart-state' style='grid-column: 1/-1;'><i class='fas fa-store-slash'></i><p>Menu indisponible</p></div>";
            return;
        }
        
        genererCategoriesDynamiques();
        afficherProduits();
    } catch (error) { 
        document.getElementById("menuGrid").innerHTML = "<div class='empty-cart-state' style='grid-column: 1/-1; color: var(--danger);'><i class='fas fa-exclamation-triangle'></i><p>Erreur de connexion</p></div>";
    }
}

function genererCategoriesDynamiques() {
    const container = document.getElementById('categoryTabs');
    const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(Boolean))];
    let html = `<button class="category-btn ${categorieActuelle === 'all' ? 'active' : ''}" data-category="all">🍽️ Tout</button>`;
    categoriesUniques.forEach(cat => {
        html += `<button class="category-btn ${categorieActuelle === cat ? 'active' : ''}" data-category="${cat}">${categoryLabels[cat] || cat}</button>`;
    });
    container.innerHTML = html;
}

function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    let prods = categorieActuelle === "all" ? produits : produits.filter(p => p.categorie === categorieActuelle);
    
    const enStock = prods.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = prods.filter(p => p.stock <= 0 && p.stock !== undefined);
    prods = [...enStock, ...enRupture];

    if (prods.length === 0) { 
        grille.innerHTML = "<div class='empty-cart-state' style='grid-column: 1/-1;'><p>Aucun produit dans cette catégorie</p></div>"; 
        return; 
    }

    grille.innerHTML = prods.map(p => {
        const rupture = p.stock <= 0 && p.stock !== undefined;
        const btn = rupture ? `<button class="add-to-cart disabled" disabled>Épuisé</button>` : `<button class="add-to-cart" onclick="gererClicAjout(${p.id})">Ajouter <i class="fas fa-plus"></i></button>`;
        const img = p.image || defaultImages[p.categorie] || defaultImages['sale'];
        
        return `
            <div class="menu-item ${rupture ? 'sold-out' : ''}">
                <div class="item-image" style="background-image: url('${img}');"></div>
                <div class="item-info">
                    <div>
                        <h3>${escapeHtml(p.nom)}</h3>
                        <div class="price">${parseFloat(p.prix || 0).toFixed(2)} DT</div>
                    </div>
                    ${btn}
                </div>
            </div>
        `;
    }).join('');
}

// ========== 5. GESTION DU PANIER & VARIANTES ==========
window.gererClicAjout = function(id) {
    const produit = produits.find(p => p.id === id);
    if (!produit) return;

    if (produit.typeChoix === 'aucun') {
        executerAjoutPanier(produit, null); return; 
    }

    let optionsTrouvees = produit.variantes ? produit.variantes.split(',').map(v => v.trim()) : null;
    if (!optionsTrouvees) {
        const nomLower = produit.nom.toLowerCase();
        const conf = variantesConfig.find(c => c.mots.some(m => nomLower.includes(m)));
        if (conf) optionsTrouvees = conf.options;
    }

    if (optionsTrouvees && optionsTrouvees.length > 0) {
        produitEnAttenteOption = produit;
        document.getElementById("optionsTitle").textContent = produit.nom;
        document.getElementById("optionPriceDisplay").textContent = `+ ${parseFloat(produit.prix).toFixed(2)} DT`;
        
        const isMultiple = produit.typeChoix === 'multiple';
        document.getElementById("optionsList").innerHTML = optionsTrouvees.map((opt, i) => `
            <label class="option-label">
                <input type="${isMultiple ? 'checkbox' : 'radio'}" name="varianteOption" value="${opt}" class="option-input" ${!isMultiple && i === 0 ? 'checked' : ''}>
                <div class="option-box"><span>${opt}</span><i class="fas fa-check-circle check-icon"></i></div>
            </label>
        `).join('');
        document.getElementById("optionsModal").style.display = "flex";
        if(navigator.vibrate) navigator.vibrate(10);
    } else {
        executerAjoutPanier(produit, null);
    }
};

function executerAjoutPanier(produit, variante) {
    const cartId = variante ? `${produit.id}_${variante}` : `${produit.id}`;
    
    // Vérif Stock
    if (produit.stock !== undefined) {
        const qtyDansPanier = panier.filter(item => item.baseId === produit.id).reduce((sum, item) => sum + item.quantite, 0);
        if (qtyDansPanier >= produit.stock) {
            return afficherNotification("Désolé, stock insuffisant !", "error");
        }
    }

    const existant = panier.find(i => i.cartId === cartId);
    if (existant) existant.quantite++;
    else panier.push({ cartId, baseId: produit.id, id: produit.id, nom: variante ? `${produit.nom} (${variante})` : produit.nom, variante, prix: parseFloat(produit.prix), quantite: 1 });

    sauvegarderPanier(); 
    mettreAJourUIPanier();
    
    // Animation Badge
    const floatCart = document.getElementById("floatingCart");
    floatCart.classList.remove("pulse"); void floatCart.offsetWidth; floatCart.classList.add("pulse");
    if(navigator.vibrate) navigator.vibrate(30);
}

window.changerQuantite = function(cartId, delta) {
    const article = panier.find(i => i.cartId === cartId);
    if (!article) return;

    if (delta > 0) {
        const pDb = produits.find(p => p.id === article.baseId);
        if (pDb && pDb.stock !== undefined) {
            const qtyDansPanier = panier.filter(item => item.baseId === article.baseId).reduce((sum, item) => sum + item.quantite, 0);
            if (qtyDansPanier >= pDb.stock) return afficherNotification("Stock insuffisant", "error");
        }
    }

    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(i => i.cartId !== cartId);
    
    sauvegarderPanier(); mettreAJourUIPanier();
    if(navigator.vibrate) navigator.vibrate(15);
};

function sauvegarderPanier() { localStorage.setItem("mon_panier", JSON.stringify(panier)); }
function chargerPanier() { const p = localStorage.getItem("mon_panier"); if (p) panier = JSON.parse(p); }

function mettreAJourUIPanier() {
    const container = document.getElementById("cartItems");
    const selectPaiement = document.getElementById("methodePaiementClient");
    
    // GESTION DU PAIEMENT VIP DYNAMIQUE
    if (selectPaiement) {
        let optVIP = selectPaiement.querySelector('option[value="carte_fidelite"]');
        if (clientFideleVerifie) {
            if (!optVIP) {
                optVIP = document.createElement('option');
                optVIP.value = 'carte_fidelite';
                selectPaiement.insertBefore(optVIP, selectPaiement.firstChild); // Le met en premier
            }
            optVIP.innerHTML = `⭐ Solde VIP (${parseFloat(clientFideleVerifie.solde).toFixed(2)} DT)`;
            selectPaiement.value = 'carte_fidelite';
        } else {
            if (optVIP) optVIP.remove();
            selectPaiement.value = 'especes';
        }
    }

    if (panier.length === 0) {
        container.innerHTML = `<div class="empty-cart-state"><i class="fas fa-shopping-bag"></i><p>Votre panier est vide</p></div>`;
        document.getElementById("cartTotal").innerText = "0.00 DT";
        document.getElementById("checkoutBtn").disabled = true;
        document.getElementById("cartBadge").innerText = "0";
        document.getElementById("floatingCart").classList.remove("visible");
        return;
    }

    document.getElementById("checkoutBtn").disabled = false;
    let total = 0, nb = 0;
    
    container.innerHTML = panier.map((item) => {
        total += item.prix * item.quantite; nb += item.quantite;
        const pDb = produits.find(p => p.id === item.baseId);
        const img = pDb && pDb.image ? pDb.image : (pDb ? defaultImages[pDb.categorie] : defaultImages['cafe']);
        const nomPropre = item.nom.split(' (')[0];
        
        return `
            <div class="modern-cart-item">
                <div class="modern-cart-item-img" style="background-image: url('${img}')"></div>
                <div class="modern-cart-item-info">
                    <h4>${escapeHtml(nomPropre)}</h4>
                    ${item.variante ? `<div class="modern-cart-item-variant">${escapeHtml(item.variante)}</div>` : ''}
                    <div class="modern-cart-item-price">${item.prix.toFixed(2)} DT</div>
                </div>
                <div class="modern-qty-control">
                    <button class="modern-qty-btn" onclick="changerQuantite('${item.cartId}', -1)"><i class="fas ${item.quantite === 1 ? 'fa-trash-alt' : 'fa-minus'}" style="color: ${item.quantite===1?'var(--danger)':'inherit'}"></i></button>
                    <span class="modern-qty-val">${item.quantite}</span>
                    <button class="modern-qty-btn" onclick="changerQuantite('${item.cartId}', 1)"><i class="fas fa-plus"></i></button>
                </div>
            </div>`;
    }).join('');

    document.getElementById("cartTotal").innerText = total.toFixed(2) + " DT";
    document.getElementById("floatingCartPrice").innerText = total.toFixed(2) + " DT";
    document.getElementById("cartBadge").innerText = nb;
    document.getElementById("floatingCart").classList.add("visible");
}

// ========== 6. PROCESSUS DE COMMANDE ==========
function passerCommande() {
    if (panier.length === 0) return;
    const tableMem = sessionStorage.getItem('tabia_table_qr');
    const authMem = sessionStorage.getItem('tabia_auth_qr');
    document.getElementById("cartModal").style.display = "none";

    if (tableMem && authMem) validerCommande(tableMem, authMem);
    else afficherModalTable(!!authMem, authMem);
}

function afficherModalTable(isVip, authFidele) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
        <div id="tableModal" class="table-modal">
            <div class="cart-content" style="max-width: 400px; padding: 24px; border-radius: 24px;">
                <h3 style="margin-bottom:1rem; text-align: center; color: var(--text-main);">Où êtes-vous installé ?</h3>
                <div class="table-buttons">${btns}</div>
                <button class="checkout-btn" style="margin-bottom:10px;" data-table="Emporter">🛍️ À Emporter</button>
                <button id="cancelTableBtn" class="checkout-btn" style="background:var(--surface-2); color:var(--text-main); box-shadow:none;">Annuler</button>
            </div>
        </div>
    `);

    const modal = document.getElementById("tableModal");
    modal.querySelector('#cancelTableBtn').onclick = () => modal.remove();
    modal.querySelectorAll('button[data-table]').forEach(btn => {
        btn.onclick = () => {
            modal.remove();
            if (isVip) validerCommande(btn.getAttribute('data-table'), authFidele);
            else afficherModalCode(btn.getAttribute('data-table'));
        };
    });
}

function afficherModalCode(numTable) {
    document.body.insertAdjacentHTML('beforeend', `
        <div id="codeModal" class="table-modal">
            <div class="cart-content" style="max-width: 400px; padding: 24px; border-radius: 24px; text-align: center;">
                <h3 style="margin-bottom:0.5rem; color: var(--text-main);">${numTable === 'Emporter' ? '🛍️ À Emporter' : 'Table '+numTable}</h3>
                <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 15px;">Entrez le code secret de la table</p>
                <input type="text" id="codeConf" class="code-input" placeholder="••••" maxlength="5">
                <button id="validerCodeBtn" class="checkout-btn" style="margin:15px 0 10px 0;">Confirmer</button>
                <button id="annulerCodeBtn" class="checkout-btn" style="background:var(--surface-2); color:var(--text-main); box-shadow:none;">Retour</button>
            </div>
        </div>
    `);

    const modal = document.getElementById("codeModal");
    modal.querySelector('#annulerCodeBtn').onclick = () => modal.remove();
    modal.querySelector('#validerCodeBtn').onclick = async () => {
        const code = document.getElementById("codeConf").value.trim();
        if(!code) return afficherNotification("Veuillez entrer un code", "error");
        modal.remove();
        validerCommande(numTable, code);
    };
}

async function validerCommande(numTable, codeSaisi) {
    afficherNotification("Envoi en cuisine...", "success");
    try {
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let idAuth = codeSaisi || clientId;
        let tableFinale = numTable === 'Emporter' ? 'Emporter' : parseInt(numTable);
        const total = panier.reduce((s, i) => s + (i.prix * i.quantite), 0);
        const methode = document.getElementById('methodePaiementClient').value;

        const response = await fetch('/api/commandes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articles: panier, numeroTable: tableFinale, clientId: idAuth, 
                codeAuth: idAuth, clientName: nomPremium, total, methodePaiement: methode 
            })
        });

        if (response.ok) {
            const cmd = await response.json();
            const key = `tabia_mes_commandes_${clientId}`;
            let hist = JSON.parse(localStorage.getItem(key) || "[]");
            hist.unshift({ ...cmd, expiration: Date.now() + HISTORIQUE_EXPIRATION });
            localStorage.setItem(key, JSON.stringify(hist.slice(0,15)));
            
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); chargerMesCommandes();
            
            if (methode === 'en_ligne' && cmd.payUrl) {
                setTimeout(() => window.location.href = cmd.payUrl, 1000); return; 
            }
            afficherNotification("🎉 Commande envoyée !");
            if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
            
            if (cmd.bonusInfo) setTimeout(() => afficherNotification(cmd.bonusInfo), 3000);
        } else {
            const err = await response.json();
            afficherNotification("❌ " + err.error, "error");
            if (response.status === 403) {
                sessionStorage.removeItem('tabia_table_qr');
                sessionStorage.removeItem('tabia_auth_qr');
                setTimeout(() => window.location.reload(), 2000);
            }
        }
    } catch (e) { afficherNotification("❌ Erreur serveur", "error"); }
}

// ========== 7. HISTORIQUE DES COMMANDES ==========
function chargerMesCommandes() {
    const conteneur = document.getElementById("mesCommandes");
    if(!conteneur) return;
    
    const hist = JSON.parse(localStorage.getItem(`tabia_mes_commandes_${clientId}`) || "[]");
    const valides = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if(!valides.length) { 
        conteneur.innerHTML = `<div class="empty-cart-state"><i class="fas fa-receipt"></i><p>Aucune commande en cours</p></div>`; 
        return; 
    }

    conteneur.innerHTML = valides.map(cmd => {
        let sClass = 'status-attente', sText = 'En attente', sIcon = '<i class="fas fa-clock"></i>';
        if(cmd.statut === 'en_preparation') { sClass = 'status-preparation'; sText = 'Préparation'; sIcon = '<i class="fas fa-fire fa-beat"></i>'; }
        else if(cmd.statut === 'terminee') { sClass = 'status-termine'; sText = 'Prêt !'; sIcon = '<i class="fas fa-check-circle fa-bounce"></i>'; }

        return `
            <div class="historique-commande-card">
                <div class="historique-commande-header">
                    <span class="commande-numero">Cmd #${cmd.numero||'--'}</span>
                    <span class="status-badge ${sClass}">${sIcon} ${sText}</span>
                </div>
                <div>${cmd.articles.map(a => `<div class="article-detail"><span><b style="color:var(--text-main)">${a.quantite}x</b> ${a.nom}</span><span>${(a.prix*a.quantite).toFixed(2)} DT</span></div>`).join('')}</div>
                <div style="text-align:right; font-weight:800; font-size:1.2rem; border-top:1px solid var(--border-color); padding-top:10px; margin-top:10px; color:var(--text-main);">Total: ${(cmd.total||0).toFixed(2)} DT</div>
            </div>`;
    }).join('');
}

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

// ========== 8. UTILITAIRES ==========
function afficherNotification(msg, type = "success") {
    const notif = document.createElement("div");
    notif.className = `notification ${type === "error" ? "notification-error" : ""}`;
    notif.innerHTML = msg;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 400); }, 3000);
}

function escapeHtml(text) { return String(text||'').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }