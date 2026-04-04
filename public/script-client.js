const socket = io(); // On se connecte au "Live"

// 1. Si le stock change
socket.on('update_stock', () => {
    console.log("🔄 Le stock a bougé, je recharge la liste...");
    chargerStock(); // Remplace par le nom de TA fonction qui affiche le stock
});

// 2. Si une nouvelle commande arrive (pour le Comptoir)
socket.on('nouvelle_commande', (data) => {
    console.log("🔔 Nouveau ticket !");
    chargerCommandes(); // Remplace par ta fonction qui affiche les tickets
});

// 3. Si un statut change (ex: La cuisine a fini)
socket.on('mise_a_jour_commande', () => {
    chargerCommandes(); 
});
// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let socketClient = null;
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
    clientId = getClientId();
    await chargerCatalogue();
    chargerPanier();
    mettreAJourUIPanier();
    nettoyerCommandesExpirees();
    chargerMesCommandes();
    initClientSocket();
    configurerEvenements();
});

// ========== FETCH API STOCK (SÉCURISÉ & DYNAMIQUE) ==========
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

        genererCategoriesDynamiques(); // Création automatique des boutons !
        afficherProduits();
    } catch (error) {
        const grille = document.getElementById("menuGrid");
        if(grille) grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>❌ Impossible de charger le menu.</p>";
    }
}

function genererCategoriesDynamiques() {
    const container = document.getElementById('categoryTabs');
    if (!container) return;
    
    // Extrait les catégories existantes depuis les produits du serveur
    const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(Boolean))];
    
    let html = `<button class="category-btn active" data-category="all">🍽️ Tout</button>`;
    categoriesUniques.forEach(cat => {
        const label = categoryLabels[cat] || cat; // Utilise le texte avec icône, ou le nom brut
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

    // Séparer en stock et rupture
    const enStock = produitsAffiches.filter(p => p.stock > 0 || p.stock === undefined);
    const enRupture = produitsAffiches.filter(p => p.stock <= 0 && p.stock !== undefined);
    
    // Concaténer (Ruptures à la fin)
    const produitsTries = [...enStock, ...enRupture];

    if (produitsTries.length === 0) {
        grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Aucun produit disponible dans cette catégorie</p>";
        return;
    }

    grille.innerHTML = produitsTries.map(p => {
        const rupture = p.stock <= 0 && p.stock !== undefined;
        const classeRupture = rupture ? 'sold-out' : '';
        const bouton = rupture 
            ? `<button class="add-to-cart disabled" disabled style="background:#e2e8f0; color:#94a3b8; border-color:#cbd5e1; cursor:not-allowed;">Épuisé</button>`
            : `<button class="add-to-cart" onclick="gererClicAjout(${p.id})">Ajouter <i class="fas fa-plus"></i></button>`;
            
        const imgSrc = p.image || defaultImages[p.categorie] || defaultImages['plat'];
        const prixFormatte = parseFloat(p.prix || 0).toFixed(2);

        return `
            <div class="menu-item ${classeRupture}">
                <div class="item-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center; height:140px; position:relative;">
                    ${rupture ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.7); color:white; padding:5px 10px; border-radius:5px; font-weight:bold;">ÉPUISÉ</div>` : ''}
                </div>
                <div class="item-info" style="padding:1rem; display:flex; flex-direction:column; flex:1; justify-content:space-between;">
                    <div>
                        <h3 style="font-size:1rem; font-weight:700; margin-bottom:0.3rem;">${p.nom}</h3>
                        <div class="price" style="color:#db800a; font-weight:800; font-size:1.1rem; margin-bottom:0.8rem;">${prixFormatte} DT</div>
                    </div>
                    ${bouton}
                </div>
            </div>
        `;
    }).join('');
}

// ========== GESTION DES VARIANTES (OPTIONS) ==========
// ========== GESTION DES VARIANTES (OPTIONS) ==========
function gererClicAjout(id) {
    const produit = produits.find(p => p.id === id);
    if (!produit || (produit.stock <= 0 && produit.stock !== undefined)) return;

    let optionsTrouvees = null;

    // 🔥 NOUVEAU: Si on a explicitement forcé "aucun choix" dans le tableau de bord
    if (produit.typeChoix === 'aucun') {
        executerAjoutPanier(produit, null);
        return; // On s'arrête là, le produit va direct au panier !
    }

    // Sinon, on cherche s'il y a des variantes spécifiques écrites (ex: "Grand, Petit")
    if (produit.variantes && produit.variantes.trim() !== "") {
        optionsTrouvees = produit.variantes.split(',').map(v => v.trim());
    } 
    // Sinon, on applique la règle automatique par mots-clés (si ça n'a pas été forcé sur 'aucun')
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
    
    // 🔥 NOUVELLE GESTION DE L'AFFICHAGE (UNIQUE OU MULTIPLE) 🔥
    let isMultiple = produit.typeChoix === 'multiple';
    let typeInput = isMultiple ? 'checkbox' : 'radio';
    
    const listHtml = options.map((opt, index) => `
        <label style="display:flex; align-items:center; gap:15px; padding:12px; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:8px; cursor:pointer;">
            <input type="${typeInput}" name="varianteOption" value="${opt}" style="width:22px; height:22px; accent-color:#db800a;" ${(!isMultiple && index === 0) ? 'checked' : ''}>
            <span style="font-weight:600; font-size:1.1rem; color:#1e293b;">${opt}</span>
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

function afficherContenuPanier() {
    const conteneur = document.getElementById("cartItems");
    const totalElement = document.getElementById("cartTotal");

    if (panier.length === 0) {
        conteneur.innerHTML = "<p class='empty-message' style='margin-top:2rem; text-align:center;'>Votre panier est vide 😢</p>";
        totalElement.textContent = "Total: 0.00 DT";
        document.getElementById("checkoutBtn").disabled = true;
        return;
    }
    
    document.getElementById("checkoutBtn").disabled = false;

    let total = 0;
    conteneur.innerHTML = panier.map(article => {
        total += article.prix * article.quantite;
        const nomPropre = article.nom.split(' (')[0];
        const varianteHTML = article.variante ? `<span class="cart-item-variant" style="font-size:0.8rem; color:#7f8c8d; display:block;">${article.variante}</span>` : '';
        return `
            <div class="cart-item" style="display:flex; justify-content:space-between; align-items:center; padding:1rem 0; border-bottom:1px solid #f1f5f9;">
                <div class="cart-item-info">
                    <h4 style="margin-bottom:0;">${nomPropre}</h4>
                    ${varianteHTML}
                    <div style="color:#db800a; font-weight:600;">${article.prix.toFixed(2)} DT</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:#f8fafc; padding:5px; border-radius:20px;">
                    <button style="background:white; border:none; width:30px; height:30px; border-radius:50%; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.05); cursor:pointer;" onclick="changerQuantite('${article.cartId}', -1)">-</button>
                    <span style="font-weight:700; min-width:20px; text-align:center;">${article.quantite}</span>
                    <button style="background:white; border:none; width:30px; height:30px; border-radius:50%; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.05); cursor:pointer;" onclick="changerQuantite('${article.cartId}', 1)">+</button>
                </div>
            </div>
        `;
    }).join('');

    totalElement.textContent = `Total: ${total.toFixed(2)} DT`;
}

// ========== ENVOI COMMANDE ==========
function passerCommande() {
    if (panier.length === 0) return;
    fermerPanier();
    afficherModalTable();
}

function afficherModalTable() {
    const btns = Array.from({length: 20}, (_, i) => `<button class="table-btn" style="background:#f8fafc; border:1px solid #cbd5e1; padding:1rem; border-radius:12px; font-weight:bold; cursor:pointer;" data-table="${i+1}">${i+1}</button>`).join('');
    const modalHtml = `
        <div id="tableModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:2000;">
            <div style="background:white; border-radius:20px; padding:2rem; text-align:center; width:90%; max-width:400px;">
                <h3 style="margin-bottom:1rem; font-size:1.3rem;">Où êtes-vous installé ?</h3>
                <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; margin:1.5rem 0; max-height:250px; overflow-y:auto;">${btns}</div>
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
            
            // 🔥 On affiche TOUJOURS la demande de code, même pour "Emporter"
            afficherModalCode(numTable); 
        };
    });
}

function afficherModalCode(numTable) {
    const titre = numTable === 'Emporter' ? '🛍️ À Emporter' : `Table ${numTable}`;
    
    // Le champ devient "text" pour accepter les lettres et les chiffres
    const modalHtml = `
        <div id="codeModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:2000;">
            <div style="background:white; border-radius:20px; padding:2rem; text-align:center; width:90%; max-width:400px;">
                <h3 style="margin-bottom:0.5rem; color: #143621;">${titre}</h3>
                <p style="font-size:0.9rem; color:#64748b;">Code de la table ou Code Fidélité</p>
                <input type="text" id="codeConfirmation" style="width:100%; padding:1rem; font-size:1.5rem; font-weight:bold; text-align:center; text-transform:uppercase; letter-spacing:4px; border:2px solid #e2e8f0; border-radius:12px; margin:1rem 0; outline:none; color:#db800a;" placeholder="•••••">
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

        // 1. ON VÉRIFIE D'ABORD SI C'EST UN CLIENT FIDÈLE 
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

        // 2. SI CE N'EST PAS UN FIDÈLE ET QU'IL A CHOISI UNE TABLE, ON VÉRIFIE LE CODE TABLE
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

        // 3. CODE MAÎTRE (00000 pour dépanner)
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
        
        // 🔥 NOUVEAU : On récupère le choix de paiement du client
        const methodeElement = document.getElementById('methodePaiementClient');
        const methode = methodeElement ? methodeElement.value : 'especes';

        const response = await fetch('/api/commandes', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                articles: panier.map(a => ({ id: a.baseId, nom: a.nom, variante: a.variante, prix: a.prix, quantite: a.quantite })),
                numeroTable: tableFinale,
                clientId: idFidele,
                clientName: nomFidele, 
                total: totalCommande,
                methodePaiementRequete: methode // 🔥 On envoie le choix au serveur !
            })
        });

        if (response.ok) {
            const commande = await response.json();
            if(typeof sauvegarderCommandeClient === 'function') sauvegarderCommandeClient(commande);
            
            panier = []; sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier();
            if(typeof chargerCatalogue === 'function') await chargerCatalogue(); 
            
            // 🔥 NOUVEAU : Si en ligne, on redirige vers l'écran de paiement Flouci !
            if (methode === 'en_ligne' && commande.lienPaiement) {
                afficherNotification("⏳ Redirection vers le paiement sécurisé...", "info");
                setTimeout(() => {
                    window.location.href = commande.lienPaiement; // Redirection !
                }, 1500);
            } else {
                if (nomFidele) {
                    afficherNotification(`🎉 Merci ${nomFidele} ! Commande envoyée.`);
                } else {
                    afficherNotification("🎉 Commande envoyée avec succès !");
                }
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
    
    if(!valides.length) { conteneur.innerHTML = "<p class='empty-message' style='text-align:center; color:#7f8c8d;'>Aucune commande en cours</p>"; return; }

    conteneur.innerHTML = valides.map(cmd => {
        let statusBadge = '';
        if(cmd.statut === 'en_attente') statusBadge = '<span style="padding:4px 10px; border-radius:20px; font-size:0.75rem; color:white; font-weight:bold; background:#f39c12;">En attente</span>';
        if(cmd.statut === 'en_preparation') statusBadge = '<span style="padding:4px 10px; border-radius:20px; font-size:0.75rem; color:white; font-weight:bold; background:#3498db;">Préparation</span>';
        if(cmd.statut === 'terminee' || cmd.statut === 'paye') statusBadge = '<span style="padding:4px 10px; border-radius:20px; font-size:0.75rem; color:white; font-weight:bold; background:#27ae60;">Prête !</span>';

        return `
            <div style="background:white; border-radius:16px; padding:1rem; margin-bottom:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; border-bottom:1px solid #f1f5f9; padding-bottom:0.5rem;">
                    <span style="font-weight:800; color:#db800a;">Commande #${cmd.numero}</span>
                    ${statusBadge}
                </div>
                <div style="margin-bottom: 10px;">
                    ${cmd.articles.map(a => `<div style="font-size:0.9rem; color:#7f8c8d; display:flex; justify-content:space-between; padding:3px 0;"><span>${a.quantite}x ${a.nom}</span> <span>${(a.prix*a.quantite).toFixed(2)} DT</span></div>`).join('')}
                </div>
                <div style="font-weight:bold; text-align:right; border-top:1px solid #f1f5f9; padding-top:5px; color:#db800a;">
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
    notif.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); background:${type === "error" ? "#e74c3c" : "#2c3e50"}; color:white; padding:1rem 2rem; border-radius:30px; font-weight:600; z-index:3000; animation:slideDown 0.3s ease; box-shadow:0 4px 15px rgba(0,0,0,0.2);`;
    notif.textContent = msg;
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.transform = "translate(-50%, -100px)"; notif.style.opacity = "0"; setTimeout(() => notif.remove(), 300); }, 3000);
}

const styleNotif = document.createElement('style');
styleNotif.innerHTML = `@keyframes slideDown { from { top: -50px; } to { top: 20px; } }`;
document.head.appendChild(styleNotif);

function configurerEvenements() {
    document.getElementById("closeCart").onclick = fermerPanier;
    document.getElementById("checkoutBtn").onclick = passerCommande;
    
    // 🔥 NOUVELLE GESTION DE LA VALIDATION DES OPTIONS (UNIQUE ET MULTIPLE)
    document.getElementById("confirmOptionBtn")?.addEventListener("click", () => {
        // On cherche toutes les cases qui ont été cochées par le client
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        
        if (produitEnAttenteOption) {
            let valeursChoisies = "";
            
            if (checkedBoxes.length > 0) {
                // S'il a coché des choses, on colle tout avec des virgules (ex: "Harissa, Fromage")
                valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
            }
            
            // On ajoute au panier avec les valeurs collées
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
            if(typeof afficherProduits === 'function') afficherProduits();
        }
    });
    
    window.onclick = (e) => {
        if(e.target.id === 'cartModal') fermerPanier();
        if(e.target.id === 'optionsModal') document.getElementById("optionsModal").style.display = "none";
    }
}