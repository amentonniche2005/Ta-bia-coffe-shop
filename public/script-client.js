const socket = io(); 

// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let clientFideleVerifie = null;
const HISTORIQUE_EXPIRATION = 24 * 60 * 60 * 1000;
let produitEnAttenteOption = null;

// Configurations
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

const categoryLabels = {
    'cafe': '☕ Cafés', 'the': '🫖 Thés & Infusions', 'boissons': '🍹 Boissons',
    'dessert': '🍰 Pâtisseries', 'sale': '🥪 Salé & Snack', 'chicha': '💨 Chichas'
};

// ========== INIT GLOBALE ==========
document.addEventListener("DOMContentLoaded", async () => {
    
    // 1. Theme
    const themeBtn = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    // 2. Client ID
    clientId = localStorage.getItem('tabia_client_id');
    if (!clientId) {
        clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('tabia_client_id', clientId);
    }

    // 3. Espace VIP & URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth');

    document.getElementById('btnEspaceClient').addEventListener('click', () => {
        document.getElementById('clientModal').style.display = 'flex';
        const savedCode = sessionStorage.getItem('tabia_auth_qr');
        if (savedCode) {
            document.getElementById('clientLoginCode').value = savedCode;
            if (sessionStorage.getItem('client_nom_premium')) verifierCodeClient(true);
        }
    });

    if (authUrl) {
        document.getElementById('clientLoginCode').value = authUrl;
        await verifierCodeClient(true);
        setTimeout(() => afficherNotification("✨ Bienvenue !"), 1000);
    }
    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        setTimeout(() => afficherNotification(`📍 Table ${tableUrl} activée`), 1000);
    }
    if (tableUrl || authUrl) window.history.replaceState({}, document.title, "/");

    // Restaure le bouton VIP si rafraîchi
    if (!authUrl && sessionStorage.getItem('client_nom_premium')) {
        const prenom = sessionStorage.getItem('client_nom_premium').split(' ')[0];
        document.getElementById('btnEspaceClient').innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${prenom}`;
        verifierCodeClient(true);
    }

    // 4. Chargement des datas
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    
    // Commandes en cours
    const hist = JSON.parse(localStorage.getItem(`tabia_mes_commandes_${clientId}`) || "[]");
    const commandesActives = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if (commandesActives.length > 0) {
        try {
            const res = await fetch(`/api/mes-commandes/${clientId}`);
            if (res.ok) {
                const vraiesCommandes = await res.json();
                const newHist = hist.map(cmd => {
                    const serv = vraiesCommandes.find(c => c.id === cmd.id);
                    return serv ? { ...cmd, statut: serv.statut } : cmd;
                });
                localStorage.setItem(`tabia_mes_commandes_${clientId}`, JSON.stringify(newHist));
            }
        } catch(e) {}
    }
    chargerMesCommandesUI();

    // 5. Events
    document.getElementById("closeCart").onclick = () => document.getElementById("cartModal").style.display = "none";
    document.getElementById("floatingCart").onclick = () => { document.getElementById("cartModal").style.display = "flex"; mettreAJourUIPanier(); };
    document.getElementById("checkoutBtn").onclick = passerCommande;
    document.getElementById("closeOptions").onclick = () => document.getElementById("optionsModal").style.display = "none";
    
    document.getElementById("categoryTabs").addEventListener("click", (e) => {
        if(e.target.classList.contains("category-btn")) {
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            categorieActuelle = e.target.dataset.category;
            afficherProduits();
        }
    });

    document.getElementById("confirmOptionBtn").addEventListener("click", () => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        if (produitEnAttenteOption) {
            let valeursChoisies = checkedBoxes.length > 0 ? Array.from(checkedBoxes).map(cb => cb.value).join(', ') : "";
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies);
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });

    // Sockets
    socket.on('update_stock', chargerCatalogue);
    socket.on('nouvelle_commande', chargerMesCommandesUI);
    socket.on('mise_a_jour_commande', (cmd) => {
        const key = `tabia_mes_commandes_${clientId}`;
        let hist = JSON.parse(localStorage.getItem(key) || "[]");
        const idx = hist.findIndex(c => c.id === cmd.id);
        if(idx !== -1) {
            hist[idx].statut = cmd.statut;
            localStorage.setItem(key, JSON.stringify(hist));
            chargerMesCommandesUI();
            if(cmd.statut === 'terminee') afficherNotification("Votre commande est prête ! 🍽️");
        }
    });
});

// ========== FONCTIONS VIP ==========
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
            
            document.getElementById('vipName').innerText = `${data.customer.prenom} ${data.customer.nom}`;
            document.getElementById('vipCode').innerText = data.customer.codeFidelite;
            document.getElementById('vipPoints').innerHTML = `${parseFloat(data.customer.points || 0).toFixed(1)} <i class="fas fa-star" style="color:#f1c40f;"></i>`;
            document.getElementById('vipSolde').innerText = parseFloat(data.customer.solde || 0).toFixed(2) + ' DT';

            document.getElementById('clientLoginSection').style.display = 'none';
            document.getElementById('clientProfileSection').style.display = 'block';
            document.getElementById('btnEspaceClient').innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${data.customer.prenom}`;
            
            mettreAJourUIPanier(); // Met à jour le selecteur de paiement
            
            if (!silencieux) afficherNotification(`✨ Bienvenue ${data.customer.prenom} !`);
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

// ========== CATALOGUE & PRODUITS ==========
async function chargerCatalogue() {
    try {
        const response = await fetch('/api/stock');
        const data = await response.json();
        produits = Array.isArray(data) ? data : [];
        if (produits.length === 0) {
            document.getElementById("menuGrid").innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Le menu est vide.</p>";
            return;
        }
        
        const container = document.getElementById('categoryTabs');
        const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(Boolean))];
        let html = `<button class="category-btn ${categorieActuelle === 'all' ? 'active' : ''}" data-category="all">🍽️ Tout</button>`;
        categoriesUniques.forEach(cat => {
            html += `<button class="category-btn ${categorieActuelle === cat ? 'active' : ''}" data-category="${cat}">${categoryLabels[cat] || cat}</button>`;
        });
        container.innerHTML = html;
        afficherProduits();
    } catch (error) { }
}

function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    let prods = categorieActuelle === "all" ? produits : produits.filter(p => p.categorie === categorieActuelle);
    
    const enStock = prods.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = prods.filter(p => p.stock <= 0 && p.stock !== undefined);
    prods = [...enStock, ...enRupture];

    if (prods.length === 0) { grille.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Rien ici</p>"; return; }

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

function escapeHtml(text) { return String(text||'').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }

// ========== PANIER & VARIANTES ==========
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
        document.getElementById("optionPriceDisplay").textContent = `(${parseFloat(produit.prix).toFixed(2)} DT)`;
        
        const isMultiple = produit.typeChoix === 'multiple';
        document.getElementById("optionsList").innerHTML = optionsTrouvees.map((opt, i) => `
            <label class="option-label">
                <input type="${isMultiple ? 'checkbox' : 'radio'}" name="varianteOption" value="${opt}" class="option-input" ${!isMultiple && i === 0 ? 'checked' : ''}>
                <div class="option-box"><span>${opt}</span><i class="fas fa-check-circle check-icon"></i></div>
            </label>
        `).join('');
        document.getElementById("optionsModal").style.display = "flex";
    } else {
        executerAjoutPanier(produit, null);
    }
};

function executerAjoutPanier(produit, variante) {
    const cartId = variante ? `${produit.id}_${variante}` : `${produit.id}`;
    const existant = panier.find(i => i.cartId === cartId);
    
    if (existant) existant.quantite++;
    else panier.push({ cartId, baseId: produit.id, id: produit.id, nom: variante ? `${produit.nom} (${variante})` : produit.nom, variante, prix: parseFloat(produit.prix), quantite: 1 });

    sauvegarderPanier(); mettreAJourUIPanier();
    
    const floatCart = document.getElementById("floatingCart");
    floatCart.classList.remove("pulse"); void floatCart.offsetWidth; floatCart.classList.add("pulse");
    if(navigator.vibrate) navigator.vibrate(30);
}

window.changerQuantite = function(cartId, delta) {
    const article = panier.find(i => i.cartId === cartId);
    if (!article) return;
    article.quantite += delta;
    if (article.quantite <= 0) panier = panier.filter(i => i.cartId !== cartId);
    sauvegarderPanier(); mettreAJourUIPanier();
};

function sauvegarderPanier() { localStorage.setItem("mon_panier", JSON.stringify(panier)); }
function chargerPanier() { const p = localStorage.getItem("mon_panier"); if (p) panier = JSON.parse(p); }

function mettreAJourUIPanier() {
    const container = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");
    const btn = document.getElementById("checkoutBtn");
    const float = document.getElementById("floatingCart");
    
    // GESTION DU MENU DE PAIEMENT (Affiche VIP si connecté)
    const selectPaiement = document.getElementById("methodePaiementClient");
    if (selectPaiement) {
        let optVIP = selectPaiement.querySelector('option[value="carte_fidelite"]');
        if (clientFideleVerifie) {
            if (!optVIP) {
                optVIP = document.createElement('option');
                optVIP.value = 'carte_fidelite';
                selectPaiement.appendChild(optVIP);
            }
            optVIP.textContent = `⭐ Payer avec mon Solde VIP (${parseFloat(clientFideleVerifie.solde).toFixed(2)} DT)`;
            selectPaiement.value = 'carte_fidelite'; // Auto-select
        } else {
            if (optVIP) optVIP.remove();
            selectPaiement.value = 'especes';
        }
    }

    if (panier.length === 0) {
        container.innerHTML = `<div class="empty-cart-state"><i class="fas fa-shopping-bag"></i><p>Panier vide</p></div>`;
        totalEl.innerText = "0.00 DT"; btn.disabled = true;
        document.getElementById("cartBadge").innerText = "0";
        if (float) float.classList.remove("visible");
        return;
    }

    btn.disabled = false;
    let total = 0, nb = 0;
    
    container.innerHTML = panier.map((item, i) => {
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

    totalEl.innerText = total.toFixed(2) + " DT";
    document.getElementById("cartBadge").innerText = nb;
    document.getElementById("floatingCartPrice").innerText = total.toFixed(2) + " DT";
    if (float) float.classList.add("visible");
}

// ========== COMMANDE ==========
async function passerCommande() {
    if (panier.length === 0) return;
    const tableEnMemoire = sessionStorage.getItem('tabia_table_qr');
    const authEnMemoire = sessionStorage.getItem('tabia_auth_qr');
    document.getElementById("cartModal").style.display = "none";

    if (tableEnMemoire && authEnMemoire) validerCommande(tableEnMemoire, authEnMemoire);
    else afficherModalTable(!!authEnMemoire, authEnMemoire);
}

function afficherModalTable(isVip, authFidele) {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
        <div id="tableModal" class="table-modal">
            <div class="table-modal-content">
                <h3 style="margin-bottom:1rem;">Où êtes-vous installé ?</h3>
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
            <div class="table-modal-content">
                <h3 style="margin-bottom:0.5rem;">${numTable === 'Emporter' ? '🛍️ À Emporter' : 'Table '+numTable}</h3>
                <p style="font-size:0.9rem; color:var(--text-muted);">Code de table ou carte VIP</p>
                <input type="text" id="codeConf" class="code-input" placeholder="•••••">
                <button id="validerCodeBtn" class="checkout-btn" style="margin-bottom:10px;">Confirmer</button>
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
            localStorage.setItem(key, JSON.stringify(hist.slice(0,10)));
            
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); chargerMesCommandesUI();
            
            if (methode === 'en_ligne' && cmd.payUrl) {
                setTimeout(() => { window.location.href = cmd.payUrl; }, 1000); return; 
            }
            afficherNotification("🎉 Commande envoyée !");
            if (cmd.bonusInfo) setTimeout(() => afficherNotification(cmd.bonusInfo), 2500);
        } else {
            const err = await response.json();
            afficherNotification("❌ " + err.error, "error");
        }
    } catch (e) { afficherNotification("❌ Erreur serveur", "error"); }
}

// ========== HISTORIQUE UI ==========
function chargerMesCommandesUI() {
    const conteneur = document.getElementById("mesCommandes");
    if(!conteneur) return;
    
    const hist = JSON.parse(localStorage.getItem(`tabia_mes_commandes_${clientId}`) || "[]");
    const valides = hist.filter(c => c.expiration > Date.now() && c.statut !== 'paye');
    
    if(!valides.length) { 
        conteneur.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);"><i class="fas fa-receipt fa-2x" style="opacity:0.3;"></i><p>Rien en cours</p></div>`; 
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
                <div>${cmd.articles.map(a => `<div class="article-detail"><span><b>${a.quantite}x</b> ${a.nom}</span><span>${(a.prix*a.quantite).toFixed(2)}</span></div>`).join('')}</div>
                <div style="text-align:right; font-weight:800; font-size:1.2rem; border-top:1px solid var(--border-color); padding-top:10px; margin-top:10px;">Total: ${(cmd.total||0).toFixed(2)} DT</div>
            </div>`;
    }).join('');
}

function afficherNotification(msg, type = "success") {
    const notif = document.createElement("div");
    notif.className = `notification ${type === "error" ? "notification-error" : ""}`;
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 3000);
}