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
let NB_TABLES_MAX = 160;
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
 'the': '🫖 Thés',
  'boissons': '🥤 Boissons',
   'dessert': '🍰 Pâtisseries',
    'sale': '🥪 Salé',
     'sandwish': '🥪 Sandwiches',
     'chicha': '💨 Chichas',
     'Ma9loub': '🌮 ma9loub',
     'Pizza': '🍕 Pizza',
     'BagetteFarci': '🥖 Bagette Farci',
     'Tacos': '🌯 Tacos',
     'Burger': '🍔 Burger',
     'Crepes': '🦪Crepes',
     'plats': '🍽 Plats',
     'Pasta': '🍝 Pasta',
     'Libanai': '🌯 Libanai'
};
// ========== CHARGEMENT ==========
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableUrl = urlParams.get('table');
    const authUrl = urlParams.get('auth') || urlParams.get('AUTH'); // Accepte majuscules/minuscules

    let doitOuvrirVIPAutomatiquement = false;
    let codeVIP = null;

    // 1. GESTION DU LIEN VIP DIRECT (?auth=1234 sans table)
    if (authUrl && !tableUrl) {
        doitOuvrirVIPAutomatiquement = true;
        codeVIP = authUrl;

        // On stocke le code
        sessionStorage.setItem('tabia_auth_qr', authUrl);
        localStorage.setItem('tabia_auth_qr', authUrl);

        // On nettoie l'URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. GESTION DU SCAN DE TABLE (?table=4)
    if (tableUrl) {
        sessionStorage.setItem('tabia_table_qr', tableUrl);
        if (authUrl) sessionStorage.setItem('tabia_auth_qr', authUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
        
        setTimeout(() => { 
            if (typeof afficherNotification === 'function') afficherNotification(`📍 Table ${tableUrl} activée`, "success"); 
        }, 5300);
    }

    // 3. VÉRIFICATION DE SÉCURITÉ (GHOST SESSION)
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
        } catch(e) { console.error("Erreur check session", e); }
    }

    // 4. INITIALISATION NORMALE
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

    // 5. BOUTON ESPACE CLIENT (Le clic manuel)
    const btnEspace = document.getElementById('btnEspaceClient');
    if (btnEspace) {
        btnEspace.addEventListener('click', () => {
            document.getElementById('clientModal').style.display = 'flex';
            
            // On vérifie s'il a un code en mémoire
            const savedCode = sessionStorage.getItem('tabia_auth_qr') || localStorage.getItem('tabia_auth_qr');
            
            if (savedCode) {
                document.getElementById('clientLoginCode').value = savedCode;
                if (typeof window.verifierCodeClient === 'function') window.verifierCodeClient(true);
            } else {
                // S'il n'a rien, on force l'affichage de la zone pour taper le code
                document.getElementById('clientLoginSection').style.display = 'block';
                document.getElementById('clientProfileSection').style.display = 'none';
                document.getElementById('clientLoginCode').value = "";
            }
        });

        // Affichage du prénom sur le bouton si connu
        if (sessionStorage.getItem('client_nom_premium')) {
            const prenom = sessionStorage.getItem('client_nom_premium').split(' ')[0];
            btnEspace.innerHTML = `<i class="fas fa-crown" style="color:#f1c40f;"></i> ${prenom}`;
        }
    }

    // 6. 🔥 L'OUVERTURE AUTOMATIQUE (Strictement réservé au lien VIP)
    if (doitOuvrirVIPAutomatiquement) {
        setTimeout(() => {
            const modal = document.getElementById('clientModal');
            const inputCode = document.getElementById('clientLoginCode');
            
            if (modal && inputCode) {
                modal.style.display = 'flex';
                inputCode.value = codeVIP;
                if (typeof window.verifierCodeClient === 'function') {
                    window.verifierCodeClient(false); // Charge la carte VIP visuellement
                }
            }
        }, 5300); // Délai exact pour attendre la fin de ton Splash Screen
    }

    // 7. DARK MODE
    const btnDark = document.getElementById('darkModeToggle');
    if (localStorage.getItem('tabia_darkmode') === 'true') {
        document.body.classList.add('dark-mode');
        if (btnDark) btnDark.classList.replace('fa-moon', 'fa-sun');
    }
    if (btnDark) {
        btnDark.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('tabia_darkmode', isDark);
            btnDark.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
            if(navigator.vibrate) navigator.vibrate(15);
        });
    }
});
function getClientId() {
    let id = localStorage.getItem('tabia_client_id');
    if (!id) {
        id = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('tabia_client_id', id);
    }
    return id;
}
async function appliquerBranding() {
    try {
        const response = await fetch('/api/branding');
        const config = await response.json();

        if (config) {
            document.getElementById('dynamicName').innerText = config.nomCafe || "SARBINI";
            document.getElementById('dynamicSlogan').innerText = config.sloganCafe || "";
            if (config.logoUrl) document.getElementById('dynamicLogo').src = config.logoUrl;
            if (config.nombreTables) { NB_TABLES_MAX = parseInt(config.nombreTables); };
            window.CODE_SERVEUR = config.codeServeur || "00000";
        }

        // ⏳ LA PAUSE DE 3 SECONDES EST ICI
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('splash-hidden'); // Démarre le fondu
                
                setTimeout(() => {
                    splash.style.display = 'none'; // Supprime après le fondu
                }, 800);
            }
        }, 2000); 

    } catch (error) {
        console.error("Erreur lors du chargement du branding:", error);
        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'none';
    }
}

window.onload = appliquerBranding;
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
    
    // 🔥 FILTRAGE : On récupère les catégories mais on EXCLUT 'supplement'
    const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(cat => cat && cat !== 'supplement'))];
    
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
    produitsAffiches = produitsAffiches.filter(p => p.categorie !== 'supplement');
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
: `<button class="add-to-cart" onclick="gererClicAjout(event, ${p.id})">Ajouter <i class="fas fa-plus"></i></button>`;            
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

// ========== GESTION DES VARIANTES & SUPPLÉMENTS (PREMIUM) ==========

let prixBaseEnAttente = 0;

function gererClicAjout(event, id) {
    const produit = produits.find(p => p.id === id);
    if (!produit || (produit.stock <= 0 && produit.stock !== undefined)) return;

    let optionsTrouvees = null;

    if (produit.typeChoix === 'aucun') {
        // S'il a des suppléments mais pas de variantes, on ouvre quand même la modale !
        if (produit.supplements && produit.supplements.length > 0) {
             ouvrirModalOptions(produit, null);
        } else {
             executerAjoutPanier(produit, null, []);
             animerVersPanierClient(event); 
        }
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

    if ((optionsTrouvees && optionsTrouvees.length > 0) || (produit.supplements && produit.supplements.length > 0)) {
        ouvrirModalOptions(produit, optionsTrouvees);
    } else {
        executerAjoutPanier(produit, null, []);
        animerVersPanierClient(event); 
    }
}

function ouvrirModalOptions(produit, options) {
    produitEnAttenteOption = produit;
    prixBaseEnAttente = parseFloat(produit.prix) || 0;
    
    document.getElementById("optionsTitle").textContent = produit.nom;
    document.getElementById("optionPriceDisplay").textContent = `Base : ${prixBaseEnAttente.toFixed(2)} DT`;
    
    // --- 1. GESTION DES VARIANTES ---
    const sectionVar = document.getElementById("sectionVariantes");
    if (options && options.length > 0) {
        let isMultiple = produit.typeChoix === 'multiple';
        let typeInput = isMultiple ? 'checkbox' : 'radio';
        
        const listHtml = options.map((opt, index) => `
            <label class="option-label" style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid var(--border-color); display:flex; align-items:center; cursor:pointer;">
                <input type="${typeInput}" name="varianteOption" value="${opt}" class="option-input" style="margin-right:10px; transform:scale(1.2);" ${(!isMultiple && index === 0) ? 'checked' : ''}>
                <div class="option-box" style="flex:1; font-weight:600; color:var(--text-main);">
                    <span>${opt}</span>
                </div>
            </label>
        `).join('');
        
        document.getElementById("optionsList").innerHTML = listHtml;
        sectionVar.style.display = "block";
    } else {
        document.getElementById("optionsList").innerHTML = "";
        sectionVar.style.display = "none";
    }

    // --- 2. GESTION DES SUPPLÉMENTS ---
    const sectionSupp = document.getElementById("sectionSupplements");
    if (produit.supplements && produit.supplements.length > 0) {
        const suppHtml = produit.supplements.map((supp, index) => `
            <label class="option-label" style="background:white; padding:10px; border-radius:8px; border:1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                <div style="display:flex; align-items:center;">
                    <input type="checkbox" name="supplementOption" value="${supp.prix}" data-id="${supp._id || supp.id}" data-nom="${supp.nom}" class="supp-input" style="margin-right:10px; transform:scale(1.2);" onchange="mettreAJourTotalModal()">
                    <span style="font-weight:600; color:var(--text-main);">${supp.nom}</span>
                </div>
                <span style="color:var(--success); font-weight:800; font-size:0.9rem;">+ ${parseFloat(supp.prix).toFixed(3)} DT</span>
            </label>
        `).join('');
        
        document.getElementById("supplementsList").innerHTML = suppHtml;
        sectionSupp.style.display = "block";
    } else {
        document.getElementById("supplementsList").innerHTML = "";
        sectionSupp.style.display = "none";
    }

    mettreAJourTotalModal();
    document.getElementById("optionsModal").style.display = "flex";
}

// 🔥 NOUVEAU : Calcul dynamique du prix total en bas de la modale
function mettreAJourTotalModal() {
    let total = prixBaseEnAttente;
    const suppChecked = document.querySelectorAll('input[name="supplementOption"]:checked');
    
    suppChecked.forEach(box => {
        total += parseFloat(box.value) || 0;
    });

    document.getElementById("prixTotalOptionsBtn").textContent = `(${total.toFixed(2)} DT)`;
}

window.executerAjoutPanier = function(idProduit) {
    const produit = produits.find(p => String(p.id) === String(idProduit) || String(p._id) === String(idProduit));
    if (!produit) return;

    let vari = null;
    let suppsChoisis = [];

    if (produit.typeChoix === 'unique') {
        const select = document.getElementById(`variante-${idProduit}`);
        if (select) vari = select.value;
    } else if (produit.typeChoix === 'multiple') {
        const checkboxes = document.querySelectorAll(`.checkbox-${idProduit}:checked`);
        vari = Array.from(checkboxes).map(cb => cb.value).join(', ');
        if (!vari) vari = "Nature"; 
    }

    // Extraction des suppléments cochés par le client
    if (produit.supplements && produit.supplements.length > 0) {
        const suppCheckboxes = document.querySelectorAll(`.supp-${idProduit}:checked`);
        suppCheckboxes.forEach(cb => {
            const index = cb.getAttribute('data-index');
            suppsChoisis.push(produit.supplements[index]);
        });
    }

    // 🔥 CRÉATION DU LIEN DE PARENTÉ UNIQUE POUR CETTE COMMANDE
    const idGroupeUnique = Date.now(); 

    // 1. Ajouter le produit principal au panier
    panier.push({ 
        cartId: `MAIN_${idGroupeUnique}`,
        id: produit.id || produit._id, 
        nom: produit.nom, 
        variante: vari, 
        prix: parseFloat(produit.prix), 
        quantite: 1,
        isSupplement: false,
        uniqueGroupId: idGroupeUnique, // 🔥 Assigne l'ID du groupe
        parentId: null
    });

    // 2. Ajouter les suppléments comme des produits séparés, mais liés !
    if (suppsChoisis.length > 0) {
        suppsChoisis.forEach(supp => {
            panier.push({
                cartId: `SUPP_${idGroupeUnique}_${Math.random()}`, 
                baseId: supp.id || supp._id, 
                id: supp.id || supp._id, 
                nom: `+ ${supp.nom}`, 
                variante: null,
                prix: parseFloat(supp.prix),
                quantite: 1,
                isSupplement: true, 
                parentId: idGroupeUnique // 🔥 Indique que ce supplément appartient au produit principal !
            });
        });
    }

    mettreAJourUIPanier();
    fermerModal();
    playSound('pop'); 
};

function changerQuantite(cartId, delta) {
    const indexArticle = panier.findIndex(item => item.cartId === cartId);
    if (indexArticle === -1) return;
    
    const article = panier[indexArticle];

    // Sécurité Stock pour les produits principaux
    if (!article.isSupplement) {
        const produitDB = produits.find(p => p.id === article.baseId);
        if (delta > 0 && produitDB && produitDB.stock !== undefined) {
            const quantiteTotalePanier = panier.filter(item => item.baseId === article.baseId).reduce((sum, item) => sum + item.quantite, 0);
            if (quantiteTotalePanier >= produitDB.stock) {
                afficherNotification("Stock insuffisant", "error");
                return;
            }
        }
    }
        
    article.quantite += delta;
    
    // Si la quantité tombe à zéro, on supprime l'article ET ses suppléments associés
    if (article.quantite <= 0) {
        if (!article.isSupplement) {
            // C'est un plat principal, on supprime aussi ses enfants
            panier = panier.filter(item => item.parentId !== article.uniqueGroupId);
        }
        panier = panier.filter(item => item.cartId !== cartId);
    } else {
        // 🔥 Si on modifie la quantité d'un plat, il FAUT modifier la quantité de ses suppléments !
        if (!article.isSupplement) {
            panier.forEach(item => {
                if (item.parentId === article.uniqueGroupId) {
                    item.quantite = article.quantite; // Les suppléments suivent le parent
                }
            });
        }
    }
    
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
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    // --- GESTION DYNAMIQUE DU PAIEMENT VIP ---
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
            optionVIP.textContent = `⭐ Payer avec mon Solde VIP `;
            selectPaiement.value = 'carte_fidelite';
        } else {
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
    
    // 1. Calcul du prix total global (incluant les suppléments)
    panier.forEach(article => {
        total += article.prix * article.quantite;
    });

    // 2. 🔥 LOGIQUE PARENT-ENFANT POUR LE CLIENT
    const platsPrincipaux = panier.filter(a => !a.isSupplement);

    conteneur.innerHTML = platsPrincipaux.map(mainItem => {
        // On cherche les suppléments liés à CE plat spécifique
        const mesSupplements = panier.filter(s => s.isSupplement && s.parentId === mainItem.uniqueGroupId);
        
        // Design du plat principal
        let html = `
            <div class="modern-cart-item" style="flex-direction: column; align-items: stretch; padding: 15px; margin-bottom: 12px; background: white; border-radius: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.04); border: 1px solid #f1f5f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div class="modern-cart-item-info">
                        <h4 style="margin:0; font-size:1.1rem; color:#1e293b; font-weight:800;">${mainItem.nom}</h4>
                        <div class="modern-cart-item-price" style="color:#db800a; font-weight:bold;">${mainItem.prix.toFixed(2)} DT</div>
                    </div>
                    <div class="modern-qty-control" style="display:flex; align-items:center; background:#f8fafc; border-radius:10px; padding:4px; border: 1px solid #e2e8f0;">
                        <button class="modern-qty-btn" onclick="changerQuantite('${mainItem.cartId}', -1)" style="border:none; background:white; width:32px; height:32px; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.05); color:#64748b;"><i class="fas fa-minus"></i></button>
                        <span class="modern-qty-val" style="width:35px; text-align:center; font-weight:900; color:#1e293b;">${mainItem.quantite}</span>
                        <button class="modern-qty-btn" onclick="changerQuantite('${mainItem.cartId}', 1)" style="border:none; background:white; width:32px; height:32px; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.05); color:#db800a;"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
        `;
        
        // Design des suppléments (s'il y en a)
        if (mesSupplements.length > 0) {
            html += `<div style="margin-top: 12px; padding-top: 10px; border-top: 2px dashed #f1f5f9;">`;
            mesSupplements.forEach(supp => {
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding-left: 10px; margin-bottom: 6px;">
                        <span style="font-size:0.9rem; color:#64748b; font-weight:600;"><i class="fas fa-plus" style="font-size:0.7rem; color:#cbd5e1; margin-right:8px;"></i> ${supp.nom.replace('+ ', '')}</span>
                        <span style="font-size:0.9rem; font-weight:bold; color:#94a3b8;">+${supp.prix.toFixed(2)} DT</span>
                    </div>
                `;
            });
            html += `</div>`;
        }
        
        html += `</div>`;
        return html;
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
    const btns = Array.from({length: NB_TABLES_MAX}, (_, i) => `<button class="table-btn" data-table="${i+1}">${i+1}</button>`).join('');
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

        if (codeSaisi === window.CODE_SERVEUR) authValid = true;

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

window.validerCommande = async function(numTable, clientData, codeSaisi) {
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) { 
        checkoutBtn.disabled = true; 
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; 
    }

    try {
        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let nomFidele = nomPremium || (clientData ? `${clientData.prenom} ${clientData.nom}` : null);
        let idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId;
        let tableFinale = (numTable === 'Emporter') ? 'Emporter' : parseInt(numTable);
        const totalCommande = panier.reduce((sum, item) => sum + (item.prix * item.quantite), 0);
        
        const methodeElement = document.getElementById('methodePaiementClient');
        const methodeChoisie = methodeElement ? methodeElement.value : 'especes';
        
        const response = await fetch('/api/commandes', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // 🔥 ENVOI DE LA STRUCTURE PARFAITE AU SERVEUR
                articles: panier.map(a => ({ 
                    id: a.baseId || a.id, 
                    nom: a.nom, 
                    variante: a.variante, 
                    prix: a.prix, 
                    quantite: a.quantite,
                    isSupplement: a.isSupplement || (a.nom && a.nom.startsWith('+')),
                    uniqueGroupId: a.uniqueGroupId, // Lien avec lui-même
                    parentId: a.parentId            // Lien avec le plat principal
                })),
                numeroTable: tableFinale,
                clientId: idFidele, 
                codeAuth: idFidele, 
                clientName: nomFidele, 
                total: totalCommande,
                methodePaiement: methodeChoisie 
            })
        });

        if (response.ok) {
            const commande = await response.json();
            
            if (typeof sauvegarderCommandeClient === 'function') sauvegarderCommandeClient(commande);
            panier = []; 
            if (typeof sauvegarderPanier === 'function') sauvegarderPanier(); 
            if (typeof mettreAJourUIPanier === 'function') mettreAJourUIPanier(); 
            if (typeof afficherContenuPanier === 'function') afficherContenuPanier();
            if (typeof chargerCatalogue === 'function') await chargerCatalogue();
            
            if (methodeChoisie === 'en_ligne' && commande.payUrl) {
                afficherNotification("Redirection paiement sécurisé...", "success");
                setTimeout(() => { window.location.href = commande.payUrl; }, 1500);
                return; 
            }
            
            const messageSucces = nomFidele ? `🎉 Merci ${nomFidele} ! Commande envoyée.` : "🎉 Commande envoyée avec succès !";
            afficherNotification(messageSucces, "success");
            
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
                sessionStorage.removeItem('tabia_table_qr');
                sessionStorage.removeItem('tabia_auth_qr');
                sessionStorage.removeItem('client_nom_premium'); 
                setTimeout(() => { window.location.reload(); }, 2500);
            } else if (response.status === 400) {
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
};

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
        
        if(cmd.statut === 'en_attente') { statusClass = 'status-attente'; statusText = 'En attente'; statusIcon = '<i class="fas fa-clock"></i>'; }
        else if(cmd.statut === 'en_preparation') { statusClass = 'status-preparation'; statusText = 'Préparation'; statusIcon = '<i class="fas fa-fire fa-beat" style="--fa-animation-duration: 1.5s;"></i>'; }
        else if(cmd.statut === 'terminee') { statusClass = 'status-termine'; statusText = 'C\'est Prêt !'; statusIcon = '<i class="fas fa-check-circle fa-bounce" style="--fa-animation-duration: 2s;"></i>'; }

        const numCmd = cmd.numero ? `#${cmd.numero}` : 'en cours...';

        // 🔥 LOGIQUE PARENT-ENFANT POUR L'HISTORIQUE
        const platsPrincipauxHistorique = cmd.articles.filter(a => !a.isSupplement && !(a.nom && a.nom.startsWith('+')));

        const itemsHtml = platsPrincipauxHistorique.map(mainItem => {
            let htmlDetail = `
                <div class="article-detail" style="padding: 8px 0; border-bottom: 1px solid #f8fafc;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span><span style="font-weight:900; color:#1e293b; background:#e2e8f0; padding:2px 8px; border-radius:6px; margin-right:8px;">${mainItem.quantite}x</span> <strong style="font-size:1.05rem;">${mainItem.nom}</strong> ${mainItem.variante ? `<i style="font-size:0.85rem; color:#db800a; margin-left:5px;">(${mainItem.variante})</i>` : ''}</span> 
                        <span style="font-weight:800; color:#475569;">${(mainItem.prix * mainItem.quantite).toFixed(2)} DT</span>
                    </div>
            `;
            
            // On cherche les suppléments liés
            const mesSupps = cmd.articles.filter(s => (s.isSupplement || (s.nom && s.nom.startsWith('+'))) && s.parentId === mainItem.uniqueGroupId);
            
            if (mesSupps.length > 0) {
                mesSupps.forEach(supp => {
                    htmlDetail += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-left: 45px; margin-top: 6px;">
                            <span style="font-size:0.85rem; color:#64748b; font-weight:600;"><i class="fas fa-plus" style="font-size:0.7rem; color:#cbd5e1; margin-right:6px;"></i> ${supp.nom.replace('+ ', '')}</span>
                        </div>
                    `;
                });
            }
            
            htmlDetail += `</div>`;
            return htmlDetail;
        }).join('');

        return `
            <div class="historique-commande-card">
                <div class="historique-commande-header">
                    <span class="commande-numero" style="font-size: 1.1rem; font-weight:800;">Commande ${numCmd}</span>
                    <span class="status-badge ${statusClass}" style="display:flex; align-items:center; gap:6px; padding: 6px 12px; font-size: 0.8rem; font-weight:bold;">
                        ${statusIcon} ${statusText}
                    </span>
                </div>
                <div style="margin-bottom: 15px;">
                    ${itemsHtml}
                </div>
                <div style="font-weight:900; text-align:right; border-top:2px dashed #cbd5e1; padding-top:12px; margin-top:8px; color:#143621; font-size:1.3rem;">
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
window.afficherNotification = function(msg, type = "success") {
    // 1. On supprime l'ancienne notification s'il y en a une (pour éviter qu'elles se superposent)
    const anciennes = document.querySelectorAll('.notification-premium');
    anciennes.forEach(n => n.remove());

    // 2. On crée la nouvelle bulle
    const notif = document.createElement("div");
    notif.className = "notification-premium";
    
    // 3. Design "Blindé" directement en JS (Infaillible)
    notif.style.position = "fixed";
    notif.style.top = "20px";
    notif.style.left = "50%";
    notif.style.transform = "translateX(-50%) translateY(-150px)"; // Cachée en haut au départ
    notif.style.backgroundColor = type === "error" ? "#e74c3c" : "#143621"; // Rouge (Erreur) ou Vert (Succès)
    notif.style.color = "white";
    notif.style.padding = "16px 24px";
    notif.style.borderRadius = "14px";
    notif.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
    notif.style.zIndex = "9999999"; // Toujours au premier plan
    notif.style.display = "flex";
    notif.style.flexDirection = "column";
    notif.style.minWidth = "280px";
    notif.style.maxWidth = "90%";
    notif.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease"; // Effet de rebond
    notif.style.overflow = "hidden";

    // 4. Le contenu avec la Barre de temps
    const icone = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
    const couleurIcone = type === "error" ? "#ffcccc" : "#a7f3d0"; // Icône légèrement plus claire

    notif.innerHTML = `
        <div style="display:flex; align-items:center; font-weight: 600; font-size: 1rem;">
            <i class="fas ${icone}" style="margin-right: 12px; font-size: 1.3rem; color: ${couleurIcone};"></i> 
            ${msg}
        </div>
        <div style="position: absolute; bottom: 0; left: 0; height: 4px; background: rgba(255,255,255,0.4); width: 100%; transition: width 3s linear;" id="notifBar"></div>
    `;

    document.body.appendChild(notif);

    // 5. Animation d'entrée (Descente avec rebond)
    setTimeout(() => {
        notif.style.transform = "translateX(-50%) translateY(0)";
        // Lancement de la barre de temps
        setTimeout(() => { 
            const barre = document.getElementById('notifBar');
            if(barre) barre.style.width = "0%"; 
        }, 50);
    }, 10);

    // 6. Animation de sortie après 3 secondes (Remontée et disparition)
    setTimeout(() => { 
        notif.style.transform = "translateX(-50%) translateY(-150px)"; 
        notif.style.opacity = "0"; 
        setTimeout(() => notif.remove(), 500); 
    }, 3000);
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
    
document.getElementById("confirmOptionBtn")?.addEventListener("click", (e) => {
        const checkedBoxes = document.querySelectorAll('input[name="varianteOption"]:checked');
        const checkedSupps = document.querySelectorAll('input[name="supplementOption"]:checked'); // 🔥 CAPTURE DES SUPPLÉMENTS
        
        if (produitEnAttenteOption) {
            let valeursChoisies = "";
            let supplementsChoisis = [];
            
            if (checkedBoxes.length > 0) {
                valeursChoisies = Array.from(checkedBoxes).map(cb => cb.value).join(', ');
            }
            
                if (checkedSupps.length > 0) {
                supplementsChoisis = Array.from(checkedSupps).map(box => ({
                    id: box.getAttribute('data-id'), // 🔥 ON RÉCUPÈRE LE VRAI ID ICI
                    nom: box.getAttribute('data-nom'),
                    prix: box.value
                }));
            }
            
            // 🔥 ON ENVOIE LES DEUX
            executerAjoutPanier(produitEnAttenteOption, valeursChoisies, supplementsChoisis);
            
            animerVersPanierClient(e); 
            document.getElementById("optionsModal").style.display = "none";
            produitEnAttenteOption = null;
        }
    });;
    
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
// ========== ANIMATION FLY TO CART ==========
function animerVersPanierClient(event) {
    if (!event) return;
    
    // 1. Récupérer les coordonnées du clic (doigt ou souris)
    const startX = event.clientX || (event.touches && event.touches[0].clientX);
    const startY = event.clientY || (event.touches && event.touches[0].clientY);

    // 2. Cible : Le panier flottant
    const ciblePanier = document.getElementById('floatingCart'); 
    
    if (!ciblePanier || !startX || !startY) return;
    
    // Si le panier n'est pas encore visible, on force l'apparition pour calculer sa position
    if (ciblePanier.style.display === "none" || ciblePanier.style.display === "") {
        ciblePanier.style.display = "flex";
        ciblePanier.style.opacity = "0"; // Invisible brièvement
    }

    const rectCible = ciblePanier.getBoundingClientRect();
    
    // On vise le petit badge avec le nombre d'articles
    const badge = document.getElementById('conteurpanier');
    const badgeRect = badge ? badge.getBoundingClientRect() : rectCible;
    
    const endX = badgeRect.left + (badgeRect.width / 2);
    const endY = badgeRect.top + (badgeRect.height / 2);

    // Rétablir le panier normal s'il était caché
    if (ciblePanier.style.opacity === "0") {
        ciblePanier.style.display = "none";
        ciblePanier.style.opacity = "1";
    }

    // 3. Créer la pastille
    const point = document.createElement('div');
    point.className = 'fly-item';
    point.style.left = `${startX}px`;
    point.style.top = `${startY}px`;
    document.body.appendChild(point);

    // 4. Faire voler la pastille
    requestAnimationFrame(() => {
        point.style.left = `${endX}px`;
        point.style.top = `${endY}px`;
        point.style.transform = 'translate(-50%, -50%) scale(0.2)';
        point.style.opacity = '0.5';
    });

    // 5. Nettoyer
    setTimeout(() => {
        point.remove();
    }, 600); 
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
