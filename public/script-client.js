
// ========== VARIABLES GLOBALES ==========
let panier = [];
let produits = []; 
let categorieActuelle = "all";
let clientId = null;
let NB_TABLES_MAX = 160;
const CONVERSIONS = {
    'mg': 0.001, 'g': 1, 'kg': 1000,
    'ml': 1, 'cl': 10, 'L': 1000,
    'cac': 5, 'cas': 15,
    'u': 1, 'portion': 1
};

window.convertirQuantite = function(valeur, uniteSource, uniteCible) {
    const facteurSource = CONVERSIONS[uniteSource] || 1;
    const facteurCible = CONVERSIONS[uniteCible] || 1;
    return (valeur * facteurSource) / facteurCible;
};
window.escapeHtml = function(text) { if (!text) return text; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; };
// 🔥 MOTEUR ERP CLIENT : Calcule le stock réel tenant compte du panier et des CONVERSIONS D'UNITÉS
window.calculerStockReel = function(produit, simulerPanier = true) {
    let consommation = {};
    
    if (simulerPanier && typeof panier !== 'undefined' && panier.length > 0) {
        panier.forEach(art => {
            const isEnvoye = typeof art.envoye !== 'undefined' ? art.envoye : false;
            
            if (!isEnvoye) {
                const qte = parseInt(art.quantite) || 0;
                
                // CAS A : L'article est un supplément
                if (art.isSupplement) {
                    const parentArt = panier.find(a => String(a.uniqueGroupId) === String(art.parentId));
                    if (parentArt) {
                        const parentDB = produits.find(p => String(p.id) === String(parentArt.baseId || parentArt.id) || String(p._id) === String(parentArt.baseId || parentArt.id));
                        if (parentDB && parentDB.supplements) {
                            const nomClean = art.nom.replace('+ ', '').trim();
                            const suppConfig = parentDB.supplements.find(s => s.nom === nomClean || s.nom === art.nom);
                            
                            if (suppConfig && suppConfig.ingredientId) {
                                const ingId = String(suppConfig.ingredientId);
                                const ingredientDB = produits.find(p => String(p.id) === ingId || String(p._id) === ingId);
                                const unitStock = ingredientDB ? (ingredientDB.unite || 'g') : 'g';
                                
                                // 🔥 CONVERSION
                                const qteConvertie = window.convertirQuantite(Number(suppConfig.quantiteADeduire) || 0, suppConfig.unite || 'g', unitStock);
                                
                                if (!consommation[ingId]) consommation[ingId] = 0;
                                consommation[ingId] += (qteConvertie * qte);
                            }
                        }
                    }
                } 
                // CAS B : L'article est un plat/boisson
                else {
                    const pDB = produits.find(p => String(p.id) === String(art.baseId || art.id) || String(p._id) === String(art.baseId || art.id));
                    if (pDB) {
                        if (pDB.isManufactured && pDB.recipe) {
                            pDB.recipe.forEach(item => {
                                const ingId = String(item.ingredientId);
                                const ingredientDB = produits.find(p => String(p.id) === ingId || String(p._id) === ingId);
                                const unitStock = ingredientDB ? (ingredientDB.unite || 'g') : 'g';
                                
                                // 🔥 CONVERSION
                                const qteConvertie = window.convertirQuantite(Number(item.quantity) || 0, item.unit || 'g', unitStock);
                                
                                if (!consommation[ingId]) consommation[ingId] = 0;
                                consommation[ingId] += (qteConvertie * qte);
                            });
                        } else if (!pDB.isManufactured) {
                            const idDb = String(pDB.id || pDB._id);
                            if (!consommation[idDb]) consommation[idDb] = 0;
                            consommation[idDb] += qte;
                        }
                    }
                }
            }
        });
    }

    if (!produit.isManufactured || !produit.recipe || produit.recipe.length === 0) {
        const idProd = String(produit.id || produit._id);
        const dejaConsomme = consommation[idProd] || 0;
        return produit.stock !== undefined ? Math.max(0, Number(produit.stock) - dejaConsomme) : 999;
    }
    
    let maxRealisable = Infinity;
    for (let item of produit.recipe) {
        const ingredient = produits.find(p => String(p.id) === String(item.ingredientId) || String(p._id) === String(item.ingredientId));
        if (!ingredient) return 0;
        
        const stockInitialIng = Number(ingredient.stock) || 0;
        const unitStock = ingredient.unite || 'g'; 
        const unitRecette = item.unit || 'g';      
        
        // 🔥 CONVERSION
        const qteRecetteConvertie = window.convertirQuantite(Number(item.quantity) || 0, unitRecette, unitStock);
        
        const dejaConsomme = consommation[String(item.ingredientId)] || 0;
        const stockDispo = Math.max(0, stockInitialIng - dejaConsomme);

        const safeQte = qteRecetteConvertie > 0 ? qteRecetteConvertie : 1;
        
        const possible = Math.floor(stockDispo / safeQte);
        if (possible < maxRealisable) maxRealisable = possible;
    }
    return maxRealisable === Infinity ? 0 : maxRealisable;
};
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
window.saasModules = {};
window.listeCombos = [];

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

            // 🔥 LECTURE DES DROITS SAAS
            window.saasModules = config.modules || {};
            
            // Si le Menu Builder est activé, on charge les formules
            if (window.saasModules.formules) {
                try {
                    const resC = await fetch('/api/combos'); // Pas de token car le client est public
                    if (resC.ok) window.listeCombos = await resC.json();
                } catch(e){}
            }
        }

        // ⏳ LA PAUSE DU SPLASH SCREEN
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('splash-hidden');
                setTimeout(() => { splash.style.display = 'none'; }, 800);
            }
        }, 2000); 

    } catch (error) {
        console.error("Erreur branding:", error);
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
    
    // 🔥 CORRECTION : On exclut formellement les catégories 'supplement' ET 'matiere'
    const categoriesUniques = [...new Set(produits.map(p => p.categorie).filter(cat => cat && cat !== 'supplement' && cat !== 'matiere'))];
    
    let html = `<button class="category-btn ${categorieActuelle === 'all' ? 'active' : ''}" data-category="all">🍽️ Tout</button>`;
    
    // 🔥 INJECTION SAAS : Afficher l'onglet Formules en premier si actif
    if (window.saasModules && window.saasModules.formules && window.listeCombos && window.listeCombos.length > 0) {
        html += `<button class="category-btn ${categorieActuelle === 'formules' ? 'active' : ''}" data-category="formules" style="color:#d97706; border-color:#f59e0b;"><i class="fas fa-star"></i> Formules</button>`;
    }

    categoriesUniques.forEach(cat => {
        const label = categoryLabels[cat] || cat; 
        html += `<button class="category-btn ${categorieActuelle === cat ? 'active' : ''}" data-category="${cat}">${label}</button>`;
    });
    
    container.innerHTML = html;
}

function afficherProduits() {
    const grille = document.getElementById("menuGrid");
    if (!grille) return;
    // 🔥 MOTEUR SAAS : Affichage spécial pour les Formules
    if (categorieActuelle === 'formules') {
        if (!window.listeCombos || window.listeCombos.length === 0) {
            grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Aucune formule disponible.</p>";
            return;
        }
        
        grille.innerHTML = window.listeCombos.map(c => `
            <div class="menu-item" style="border: 2px solid #f59e0b; background: linear-gradient(135deg, #fffbeb, #fef3c7);" onclick="demarrerWizardCombo('${c.id}')">
                <div class="item-info" style="width:100%; text-align:center; padding: 20px;">
                    <div style="font-size: 0.8rem; font-weight:900; color:#d97706; margin-bottom:5px;"><i class="fas fa-crown"></i> MENU SPÉCIAL</div>
                    <h3 style="font-size:1.4rem; margin-bottom: 10px;">${escapeHtml(c.nom)}</h3>
                    <div class="price" style="font-size: 1.5rem; justify-content:center; color: #b45309;">${parseFloat(c.prixFixe).toFixed(2)} DT</div>
                    <button class="add-to-cart" style="width:100%; margin-top:15px; background:#f59e0b; color:white; justify-content:center;">Composer le menu <i class="fas fa-arrow-right"></i></button>
                </div>
            </div>
        `).join('');
        return; // On arrête la fonction ici car ce ne sont pas des produits normaux
    }
    // 🔥 CORRECTION SÉCURISÉE : On crée une liste propre des produits VENDABLES uniquement
    let produitsVendables = produits.filter(p => p.categorie !== 'supplement' && p.categorie !== 'matiere');
    
    // Ensuite on filtre cette liste propre selon la catégorie choisie
    let produitsAffiches = (categorieActuelle === "all") 
        ? produitsVendables 
        : produitsVendables.filter(p => p.categorie === categorieActuelle);

    // Tri entre ceux en stock et ceux en rupture
    const enStock = produitsAffiches.filter(p => window.calculerStockReel(p) > 0 || p.stock === undefined);
    const enRupture = produitsAffiches.filter(p => window.calculerStockReel(p) <= 0 && p.stock !== undefined);
    const produitsTries = [...enStock, ...enRupture];

    if (produitsTries.length === 0) {
        grille.innerHTML = "<p class='empty-message' style='grid-column: 1/-1; text-align:center;'>Aucun produit disponible dans cette catégorie</p>";
        return;
    }

// Le tri est déjà fait avant (produitsTries)
    grille.innerHTML = produitsTries.map(p => {
        // 1. Calcul du stock réel (Physique/Recette ET Vente Flash)
        let stockRestant = window.calculerStockReel(p);
        let estEpuise = stockRestant <= 0 && p.stock !== undefined;
        let badgeSaas = '';

        // ⚡ LOGIQUE VENTE FLASH (Prioritaire)
        if (window.saasModules?.ventesFlash && p.venteFlash && p.venteFlash.actif) {
            if (p.venteFlash.quantiteRestante <= 0) {
                estEpuise = true;
                badgeSaas = `<div style="position:absolute; top:8px; right:8px; background:#475569; color:white; padding:4px 10px; border-radius:8px; font-size:0.7rem; font-weight:900; z-index:2;"><i class="fas fa-times-circle"></i> FLASH TERMINÉ</div>`;
            } else {
                // On limite l'achat au plus petit des deux (stock physique vs stock flash)
                stockRestant = Math.min(stockRestant, p.venteFlash.quantiteRestante);
                badgeSaas = `<div style="position:absolute; top:8px; right:8px; background:#f59e0b; color:white; padding:4px 10px; border-radius:8px; font-size:0.7rem; font-weight:900; z-index:2; box-shadow: 0 0 10px rgba(245,158,11,0.5); animation: pulse 1.5s infinite;"><i class="fas fa-bolt"></i> VITE ! Reste ${p.venteFlash.quantiteRestante}</div>`;
            }
        }

        // 🕒 LOGIQUE PRIX (Promo & Happy Hour)
        const prixNormal = parseFloat(p.prix || 0).toFixed(2);
        const prixCalcule = window.getPrixActif ? window.getPrixActif(p) : parseFloat(p.prixPromo || p.prix);
        let affichagePrix = `<span>${prixNormal} DT</span>`;

        if (p.isHappyHourNow) {
            affichagePrix = `<s style="color:#94a3b8; font-size:0.85rem; margin-right:5px;">${prixNormal}</s> <span style="color:#f59e0b; font-weight:900;">${prixCalcule.toFixed(2)} DT</span>`;
            if (!badgeSaas) badgeSaas = `<div style="position:absolute; top:8px; left:8px; background:#f59e0b; color:white; padding:3px 10px; border-radius:8px; font-size:0.7rem; font-weight:900; z-index:2;"><i class="fas fa-clock"></i> HAPPY HOUR</div>`;
        } else if (p.prixPromo > 0) {
            affichagePrix = `<s style="color:#94a3b8; font-size:0.85rem; margin-right:5px;">${prixNormal}</s> <span style="color:#e74c3c; font-weight:800;">${prixCalcule.toFixed(2)} DT</span>`;
            if (!badgeSaas) badgeSaas = `<div style="position:absolute; top:8px; left:8px; background:#e74c3c; color:white; padding:3px 10px; border-radius:8px; font-size:0.7rem; font-weight:900; z-index:2;">PROMO</div>`;
        }

        // 🍕 LOGIQUE MOITIÉ/MOITIÉ
        if (window.saasModules?.moitieMoitie && p.isMoitieMoitieAllowed) {
            affichagePrix += `<div style="font-size:0.7rem; color:#8b5cf6; font-weight:bold; margin-top:3px;"><i class="fas fa-adjust"></i> Dispo en Moitié/Moitié</div>`;
        }

        const bouton = estEpuise 
            ? `<button class="add-to-cart disabled" disabled style="background:#94a3b8; cursor:not-allowed;">Épuisé</button>`
            : `<button class="add-to-cart" onclick="gererClicAjout(event, '${p.id || p._id}')" ${p.venteFlash?.actif ? 'style="background:#f59e0b;"' : ''}>Ajouter <i class="fas fa-plus"></i></button>`;            
        
        const imgSrc = p.image || defaultImages[p.categorie] || defaultImages['plat'];

        return `
            <div class="menu-item ${estEpuise ? 'sold-out' : ''}">
                <div class="item-image" style="background-image: url('${imgSrc}'); background-size: cover; background-position: center; position:relative;">
                    ${badgeSaas}
                </div>
                <div class="item-info">
                    <div>
                        <h3>${p.nom}</h3>
                        <div class="price">${affichagePrix}</div>
                    </div>
                    ${bouton}
                </div>
            </div>
        `;
    }).join('');
}
// ========== GESTION DES VARIANTES & SUPPLÉMENTS (PREMIUM) ==========

let prixBaseEnAttente = 0;
let produitEnAttenteOption = null;

window.gererClicAjout = function(event, id) {
    const produit = produits.find(p => String(p.id) === String(id) || String(p._id) === String(id));
    
    const stockActuel = window.calculerStockReel(produit);
    if (!produit || (stockActuel <= 0 && produit.stock !== undefined)) return;

    const aDesVariantes = produit.variantes && produit.variantes.trim() !== "";
    const aDesSupplements = produit.supplements && produit.supplements.length > 0;

    if (aDesVariantes || aDesSupplements) {
        ouvrirModalOptions(produit);
    } else {
        executerAjoutPanier(produit.id || produit._id);
        animerVersPanierClient(event); 
    }
};

window.ouvrirModalOptions = function(produit) {
    produitEnAttenteOption = produit;
    
    // Priorité au prix de la base de données (Calcul intelligent)
    prixBaseEnAttente = window.getPrixActif ? window.getPrixActif(produit) : (parseFloat(produit.prixPromo) > 0 ? parseFloat(produit.prixPromo) : parseFloat(produit.prix));    
    
    // 🧹 Nettoyage strict de l'ancienne modale
    const existant = document.getElementById('modalOptionsClientDynamique');
    if (existant) existant.remove();

    let htmlContent = `
        <div class="modal active" id="modalOptionsClientDynamique" style="z-index: 4000; align-items: flex-end; padding-bottom: 0;">
            <div class="modal-content" style="background: #f8fafc; border-top: 4px solid var(--primary-orange, #db800a); width:100%; border-radius: 25px 25px 0 0; padding: 0; box-shadow: 0 -10px 40px rgba(0,0,0,0.15); animation: slideUp 0.3s ease-out; max-height: 90vh; display:flex; flex-direction:column; overflow:hidden;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 20px 20px 15px 20px; background: white; border-bottom: 1px solid #e2e8f0;">
                    <div>
                        <h3 style="margin: 0; color: #1e293b; font-size: 1.4rem; font-weight:900;">${escapeHtml(produit.nom)}</h3>
                        <div style="color: #db800a; font-weight: 800; font-size: 1.1rem; margin-top:4px;">${prixBaseEnAttente.toFixed(2)} DT</div>
                    </div>
                    <button onclick="document.getElementById('modalOptionsClientDynamique').remove()" style="background:#f1f5f9; border:none; color:#64748b; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:1.2rem; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'"><i class="fas fa-times"></i></button>
                </div>
                
                <div style="overflow-y: auto; flex:1; padding: 20px;" id="clientModalOptionsScroll">
    `;

    // --- 1. SECTION VARIANTES ---
    if (produit.variantes && produit.variantes.trim() !== "") {
        const groupes = produit.variantes.split('|');
        htmlContent += groupes.map((groupeStr, gIdx) => {
            const match = groupeStr.match(/(.*)\[(.*)\]/);
            if (!match) return '';
            let titre = match[1].replace('*', '').trim();
            const estMultiple = match[1].includes('*');
            return `
                <div class="variant-group" style="margin-bottom:20px; background:white; padding:15px; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <span style="font-weight:900; font-size:0.95rem; color:#334155; text-transform:uppercase;">${titre} <span style="color:#db800a;">*</span></span>
                        <span style="font-size:0.7rem; font-weight:bold; color:white; background:${estMultiple ? '#94a3b8' : '#143621'}; padding:3px 10px; border-radius:12px;">${estMultiple ? 'Plusieurs choix' : '1 Seul choix'}</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        ${match[2].split(',').map((opt, oIdx) => `
                            <label style="cursor:pointer; display:block; margin:0;">
                                <input type="${estMultiple ? 'checkbox' : 'radio'}" name="client_variant_group_${gIdx}" value="${opt.trim()}" style="display:none;" ${(!estMultiple && oIdx === 0) ? 'checked' : ''}>
                                <div class="client-selectable-card" style="padding:12px 8px; text-align:center; font-size:0.95rem; font-weight:700; border: 2px solid #e2e8f0; border-radius:12px; color:#64748b; transition:all 0.2s ease;">
                                    ${opt.trim()}
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>`;
        }).join('');
    }

    // --- 2. SECTION SUPPLÉMENTS ---
    if (produit.supplements && produit.supplements.length > 0) {
        htmlContent += `
            <div style="font-weight:900; font-size:0.95rem; color:#334155; text-transform:uppercase; margin:25px 0 12px 0; padding-left:5px;">Extras & Suppléments</div>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">`;
            
        htmlContent += produit.supplements.map(supp => {
            const ref = produits.find(p => String(p.id) === String(supp.ingredientId || supp.id) || String(p._id) === String(supp.ingredientId || supp.id));
            let estRupture = false;
            if (ref) {
                const stockRestant = window.calculerStockReel(ref, true); 
                const qteBase = parseFloat(supp.quantiteADeduire) || 0;
                const unitSupp = supp.unite || 'g';
                const unitStock = ref.unite || 'g';
                const qteConvertie = window.convertirQuantite(qteBase, unitSupp, unitStock);
                if (stockRestant < qteConvertie) estRupture = true;
            }
            
            const pNormal = parseFloat(supp.prix || 0);
            const pPromo = parseFloat(supp.prixPromo || 0); 
            const prixFinal = pPromo > 0 ? pPromo : pNormal;

            const affichagePrixSupp = pPromo > 0 
                ? `<div style="text-align:right;"><s style="font-size:0.75rem; color:#94a3b8;">+${pNormal.toFixed(2)}</s><br><span style="color:#10b981; font-weight:900;">+${prixFinal.toFixed(2)} DT</span></div>`
                : `<span style="font-weight:800; color:#10b981;">+ ${pNormal.toFixed(2)} DT</span>`;

            return `
                <label style="cursor: ${estRupture ? 'not-allowed' : 'pointer'}; opacity: ${estRupture ? '0.5' : '1'}; display:block; margin:0;">
                    <input type="checkbox" name="clientSuppOption" value="${prixFinal}" data-id="${supp.ingredientId || supp.id || ''}" data-nom="${supp.nom}" style="display:none;" ${estRupture ? 'disabled' : ''} onchange="mettreAJourTotalModalClient()">
                    <div class="client-selectable-card ${estRupture ? 'disabled' : ''}" style="padding:15px; background:white; border:2px solid #e2e8f0; border-radius:16px; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s ease; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <span style="font-weight:700; color:#334155; font-size:1rem; display:flex; align-items:center;"><i class="fas fa-plus-circle" style="color:#cbd5e1; margin-right:10px; font-size:1.2rem;"></i> ${escapeHtml(supp.nom)}</span>
                        ${estRupture ? '<span style="color:#ef4444; font-weight:800; font-size:0.8rem; background:#fee2e2; padding:4px 10px; border-radius:8px;">ÉPUISÉ</span>' : affichagePrixSupp}
                    </div>
                </label>`;
        }).join('');
        htmlContent += `</div>`;
    }

    htmlContent += `
                </div>
                <div style="padding: 15px 20px; background: white; border-top: 1px solid #e2e8f0;">
                    <button onclick="validerOptionsClient(event)" style="width:100%; background:#143621; color:white; padding:18px; border-radius:16px; border:none; font-weight:900; font-size:1.1rem; cursor:pointer; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 8px 20px rgba(20, 54, 33, 0.25); transition:0.2s;">
                        <span><i class="fas fa-shopping-bag" style="margin-right:8px;"></i> Ajouter au panier</span>
                        <span id="clientPrixTotalOptionsBtn" style="background:rgba(255,255,255,0.2); padding:6px 14px; border-radius:10px;">${prixBaseEnAttente.toFixed(2)} DT</span>
                    </button>
                </div>
            </div>
        </div>
        <style>
            input[type="radio"]:checked + .client-selectable-card,
            input[type="checkbox"]:checked + .client-selectable-card {
                border-color: #db800a !important; background: #fff7ed !important; color: #db800a !important;
                box-shadow: 0 4px 12px rgba(219, 128, 10, 0.15) !important;
            }
            input[type="checkbox"]:checked + .client-selectable-card i.fa-plus-circle { color: #db800a !important; transform: rotate(90deg); transition: transform 0.3s ease; }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        </style>
    `;

    document.body.insertAdjacentHTML('beforeend', htmlContent);
};

window.mettreAJourTotalModalClient = function() {
    let total = prixBaseEnAttente;
    document.querySelectorAll('input[name="clientSuppOption"]:checked').forEach(box => { total += parseFloat(box.value) || 0; });
    document.getElementById("clientPrixTotalOptionsBtn").textContent = `${total.toFixed(2)} DT`;
};
window.validerOptionsClient = function(event) {
    if (!produitEnAttenteOption) return;
    
    let choixFinaux = [];
    document.querySelectorAll('.variant-group').forEach((groupe, idx) => {
        const coches = groupe.querySelectorAll(`input[name="client_variant_group_${idx}"]:checked`);
        if (coches.length > 0) {
            choixFinaux.push(Array.from(coches).map(c => c.value).join('+'));
        }
    });
    
    let suppsChoisis = [];
    document.querySelectorAll('input[name="clientSuppOption"]:checked').forEach(box => {
        suppsChoisis.push({ id: box.getAttribute('data-id'), nom: box.getAttribute('data-nom'), prix: parseFloat(box.value) || 0 });
    });

    executerAjoutPanier(produitEnAttenteOption, choixFinaux.join(' / '), suppsChoisis);
    animerVersPanierClient(event); 
    document.getElementById("modalOptionsClientDynamique").remove();
    produitEnAttenteOption = null;
};
window.executerAjoutPanier = function(idOuObjetProduit, varForcee = null, suppsChoisis = []) {
    let produit = (typeof idOuObjetProduit === 'object' && idOuObjetProduit !== null)
        ? idOuObjetProduit
        : produits.find(p => String(p.id) === String(idOuObjetProduit) || String(p._id) === String(idOuObjetProduit));

    if (!produit) return;

    // 🔥 SÉCURITÉ PRIX (Inclut Happy Hour s'il est actif sur le serveur)
    const prixInitial = window.getPrixActif ? window.getPrixActif(produit) : (parseFloat(produit.prixPromo) > 0 ? parseFloat(produit.prixPromo) : parseFloat(produit.prix));
    const idGroupeUnique = Date.now(); 

    // 1. Ajout du plat principal au panier
    panier.push({ 
        cartId: `MAIN_${idGroupeUnique}`,
        id: String(produit.id || produit._id), 
        baseId: String(produit.id || produit._id),
        nom: String(produit.nom), 
        variante: varForcee ? String(varForcee) : null, 
        prix: Number(prixInitial),
        quantite: 1,
        isSupplement: false,
        uniqueGroupId: idGroupeUnique,
        parentId: null
    });

    // 2. Ajout des suppléments rattachés
    if (Array.isArray(suppsChoisis) && suppsChoisis.length > 0) {
        suppsChoisis.forEach(supp => {
            panier.push({
                cartId: `SUPP_${idGroupeUnique}_${Math.random().toString(36).substr(2, 5)}`, 
                baseId: String(supp.id || `SUPP_BASE`), 
                id: String(supp.id), 
                nom: `+ ${supp.nom}`, 
                variante: null,
                prix: Number(parseFloat(supp.prix) || 0),
                quantite: 1,
                isSupplement: true, 
                parentId: idGroupeUnique 
            });
        });
    }

    sauvegarderPanier();
    mettreAJourUIPanier();
    if (typeof afficherContenuPanier === 'function') afficherContenuPanier();
    const modal = document.getElementById("optionsModal");
    if(modal) modal.style.display = "none";
    
    playSound('pop'); 

    // 🔥 3. DÉCLENCHEMENT UPSELL AUTOMATIQUE (Si autorisé par le backend)
    // On suppose que tu envoies l'objet config dans le HTML ou qu'on le lit, mais vu qu'on a le produit...
    if (produit.upsellProduits && produit.upsellProduits.length > 0) {
        const prodsUpsell = produits.filter(p => produit.upsellProduits.includes(p.nom) || produit.upsellProduits.includes(String(p.id)));
        if (prodsUpsell.length > 0) {
            afficherModalUpsellClient(produit.nom, prodsUpsell);
        }
    }
};

window.afficherModalUpsellClient = function(nomProduitSource, produitsSuggérés) {
    // 🧹 NETTOYAGE UNIQUE ET PROPRE
    const existant = document.getElementById('modalUpsellClient');
    if (existant) existant.remove();

    let htmlUpsell = `
        <div class="modal active" id="modalUpsellClient" style="z-index: 2000; align-items: flex-end; padding-bottom: 20px;">
            <div class="modal-content" style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #f59e0b; width:100%; border-radius: 25px; padding: 20px; box-shadow: 0 -10px 40px rgba(245, 158, 11, 0.2); animation: slideUp 0.3s ease-out;">
                <h3 style="color:#fcd34d; font-size:1.2rem; font-weight:800; margin-bottom:5px; text-align:center;">
                    <i class="fas fa-fire"></i> Vous aimerez aussi...
                </h3>
                <p style="color:#94a3b8; font-size:0.85rem; margin-bottom:15px; text-align:center;">Parfait avec votre <strong>${escapeHtml(nomProduitSource)}</strong> !</p>
                <div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px;">
    `;

    produitsSuggérés.forEach(p => {
        const prix = window.getPrixActif ? window.getPrixActif(p).toFixed(2) : (p.prixPromo > 0 ? parseFloat(p.prixPromo).toFixed(2) : parseFloat(p.prix).toFixed(2));
        const img = p.image || 'https://via.placeholder.com/80';
        htmlUpsell += `
            <div onclick="executerAjoutPanier('${p.id||p._id}'); document.getElementById('modalUpsellClient').remove(); animerVersPanierClient(event);" 
                 style="min-width: 120px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; padding: 10px; text-align: center; cursor: pointer;">
                <img src="${img}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin: 0 auto 10px; border: 2px solid #fcd34d;">
                <div style="color:white; font-size:0.8rem; font-weight:700; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nom)}</div>
                <div style="color:#f59e0b; font-weight:900; font-size:0.9rem;">+${prix} DT</div>
            </div>
        `;
    });

    htmlUpsell += `
                </div>
                <button onclick="document.getElementById('modalUpsellClient').remove();" style="width:100%; background:transparent; border:none; color:#cbd5e1; font-weight:600; cursor:pointer; margin-top:10px; padding:10px;">Non merci, passer au panier</button>
            </div>
        </div>
        <style>@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }</style>
    `;
    document.body.insertAdjacentHTML('beforeend', htmlUpsell);
};

function changerQuantite(cartId, delta) {
    const indexArticle = panier.findIndex(item => item.cartId === cartId);
    if (indexArticle === -1) return;
    
    const article = panier[indexArticle];

    // 🔥 SÉCURITÉ ERP : VÉRIFICATION GLOBALE (Plat + Suppléments) LORS D'UN AJOUT (+)
    if (delta > 0 && !article.isSupplement) {
        // 1. Vérif Stock du Plat Principal
        const produitDB = produits.find(p => String(p.id) === String(article.baseId) || String(p._id) === String(article.baseId));
        if (produitDB) {
            const stockRestant = window.calculerStockReel(produitDB, true); 
            if (stockRestant < delta) {
                afficherNotification("❌ Stock insuffisant pour ce plat", "error");
                return;
            }

            // 2. Vérif Stock des Suppléments rattachés à ce plat !
            const sesSupplements = panier.filter(s => String(s.parentId) === String(article.uniqueGroupId));
            for (let supp of sesSupplements) {
                const configSupp = produitDB.supplements?.find(s => s.nom === supp.nom.replace('+ ', '').trim());
                if (configSupp && configSupp.ingredientId) {
                    const ingDB = produits.find(p => String(p.id) === String(configSupp.ingredientId) || String(p._id) === String(configSupp.ingredientId));
                    if (ingDB) {
const stockIngRestant = window.calculerStockReel(ingDB, true);
                        const qteBase = parseFloat(configSupp.quantiteADeduire) || 0;
                        
                        // 🔥 CORRECTION ERP : On convertit l'extra demandé
                        const unitSupp = configSupp.unite || 'g';
                        const unitStock = ingDB.unite || 'g';
                        const qteConvertie = window.convertirQuantite(qteBase, unitSupp, unitStock);

                        // S'il ne reste pas assez d'ingrédient pour multiplier ce supplément
                        if (stockIngRestant < (qteConvertie * delta)) {
                            afficherNotification(`❌ Stock insuffisant pour l'extra : ${supp.nom}`, "error");
                            return; // On bloque tout l'ajout !
                        }
                    }
                }
            }
        }
    }
        
    article.quantite += delta;
    
    // Si la quantité tombe à zéro, on supprime l'article ET ses suppléments associés
    if (article.quantite <= 0) {
        if (!article.isSupplement) {
            panier = panier.filter(item => String(item.parentId) !== String(article.uniqueGroupId));
        }
        panier = panier.filter(item => item.cartId !== cartId);
    } else {
        // Les suppléments suivent le parent
        if (!article.isSupplement) {
            panier.forEach(item => {
                if (String(item.parentId) === String(article.uniqueGroupId)) {
                    item.quantite = article.quantite; 
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
// 🔥 MOTEUR DE VÉRIFICATION DU CODE PROMO
window.appliquerCodePromoClient = async function() {
    const code = document.getElementById('inputCodePromoClient').value.trim();
    const msgBox = document.getElementById('msgCodePromo');

    if (!code) { msgBox.innerHTML = "<span style='color:var(--danger);'>Veuillez saisir un code.</span>"; return; }

    try {
        msgBox.innerHTML = "<span style='color:var(--info);'><i class='fas fa-spinner fa-spin'></i> Vérification...</span>";
        
        const res = await fetch('/api/promo/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code }) 
        });

        const data = await res.json();

        if (res.ok && data.success) {
            // 🔥 On mémorise la RÈGLE au lieu d'un montant figé
            window.promoData = {
                code: data.promo.code,
                type: data.promo.type,
                valeur: data.promo.valeur
            };
            msgBox.innerHTML = `<span style='color:var(--success);'><i class='fas fa-check-circle'></i> Code appliqué !</span>`;
            afficherContenuPanier(); 
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            msgBox.innerHTML = `<span style='color:var(--danger);'><i class='fas fa-times-circle'></i> ${data.error || "Code invalide"}</span>`;
            window.promoData = null;
            window.remisePromoActuelle = 0;
            afficherContenuPanier();
        }
    } catch(e) {
        msgBox.innerHTML = "<span style='color:var(--danger);'>Erreur de connexion.</span>";
    }
};
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
    // Les plats principaux sont ceux qui N'ONT PAS de parentId
    const platsPrincipaux = panier.filter(a => !a.parentId);

    conteneur.innerHTML = platsPrincipaux.map(mainItem => {
       // On groupe tout ce qui appartient au parent (Suppléments classiques + Éléments de formules)
       const enfantsAssocies = panier.filter(s => s.parentId === mainItem.uniqueGroupId);
        
        let html = `
            <div class="modern-cart-item" style="flex-direction: column; align-items: stretch; padding: 15px; margin-bottom: 12px; background: white; border-radius: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.04); border: 1px solid #f1f5f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div class="modern-cart-item-info">
                        <h4 style="margin:0; font-size:1.1rem; color:#1e293b; font-weight:800;">
                            ${mainItem.nom}
                            ${mainItem.variante ? `<span style="font-size:0.85rem; color:#db800a; font-weight:700; margin-left:6px;">(${mainItem.variante})</span>` : ''}
                        </h4>
                        <div class="modern-cart-item-price" style="color:#db800a; font-weight:bold;">${mainItem.prix.toFixed(2)} DT</div>
                    </div>
                    <div class="modern-qty-control" style="display:flex; align-items:center; background:#f8fafc; border-radius:10px; padding:4px; border: 1px solid #e2e8f0;">
                        <button class="modern-qty-btn" onclick="changerQuantite('${mainItem.cartId}', -1)"><i class="fas fa-minus"></i></button>
                        <span class="modern-qty-val" style="width:35px; text-align:center; font-weight:900; color:#1e293b;">${mainItem.quantite}</span>
                        <button class="modern-qty-btn" onclick="changerQuantite('${mainItem.cartId}', 1)"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
        `;
        
        if (enfantsAssocies.length > 0) {
            html += `<div style="margin-top: 12px; padding-top: 10px; border-top: 2px dashed #f1f5f9;">`;
            enfantsAssocies.forEach(enfant => {
                // Logique visuelle : différencier un composant de menu (↳) d'un extra (+)
                const estComposantMenu = enfant.nom.startsWith('↳');
                const icone = estComposantMenu ? 'fa-level-up-alt fa-rotate-90' : 'fa-plus';
                const nomPropre = enfant.nom.replace('+ ', '').replace('↳ ', '');
                // N'affiche le prix que s'il est supérieur à 0 (les composants de menu sont à 0)
                const affichagePrix = enfant.prix > 0 ? `<span style="font-size:0.9rem; font-weight:bold; color:#94a3b8;">+${enfant.prix.toFixed(2)} DT</span>` : '';

                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding-left: 10px; margin-bottom: 6px;">
                        <span style="font-size:0.9rem; color:#64748b; font-weight:600;"><i class="fas ${icone}" style="font-size:0.7rem; color:#cbd5e1; margin-right:8px;"></i> ${nomPropre}</span>
                        ${affichagePrix}
                    </div>
                `;
            });
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }).join('');

    // 🔥 CORRECTIF : INJECTION DU CODE PROMO ICI (Quand le panier n'est PAS vide)
    if (window.saasModules && window.saasModules.promoCodes) {
        let promoHTML = `
            <div style="margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px dashed #cbd5e1;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:8px;"><i class="fas fa-ticket-alt text-warning"></i> Code Promo</label>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="inputCodePromoClient" placeholder="Tapez votre code..." style="flex:1; padding:10px; border-radius:8px; border:1px solid #e2e8f0; font-weight:bold; text-transform:uppercase;">
                    <button onclick="appliquerCodePromoClient()" style="background:var(--warning); color:white; border:none; border-radius:8px; padding:0 15px; font-weight:bold; cursor:pointer;">Appliquer</button>
                </div>
                <div id="msgCodePromo" style="font-size:0.8rem; font-weight:bold; margin-top:8px;"></div>
            </div>
        `;
        conteneur.insertAdjacentHTML('beforeend', promoHTML);
    }

    // 🔥 CALCUL DYNAMIQUE ET SÉCURISÉ DU TOTAL
    let remiseCalculee = 0;
    
    if (window.promoData) {
        // Recalcul en temps réel basé sur le nouveau total
        if (window.promoData.type === 'pourcentage') {
            remiseCalculee = total * (window.promoData.valeur / 100);
        } else {
            remiseCalculee = window.promoData.valeur;
        }
        
        // Anti-Total Négatif
        if (remiseCalculee > total) remiseCalculee = total;
        
        let totalFinal = total - remiseCalculee;
        
        totalElement.innerHTML = `<s style="font-size:1rem; color:#94a3b8;">${total.toFixed(2)}</s> <span style="color:var(--success); font-weight:900;">${totalFinal.toFixed(2)} DT</span>`;
        
        // On expose la valeur pour l'envoi au serveur
        window.remisePromoActuelle = remiseCalculee; 
        window.codePromoApplique = window.promoData.code;
    } else {
        totalElement.textContent = `${total.toFixed(2)} DT`;
        window.remisePromoActuelle = 0;
        window.codePromoApplique = null;
    }
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
        // 🔥 SÉCURITÉ 1 : On nettoie le panier pour éviter les articles corrompus
        const panierPropre = panier.filter(item => item && item.nom && !isNaN(item.prix));
        if (panierPropre.length === 0) {
            afficherNotification("Votre panier est vide ou invalide.", "error");
            panier = [];
            sauvegarderPanier();
            if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.innerHTML = 'Valider la commande <i class="fas fa-arrow-right"></i>'; }
            return;
        }

        const nomPremium = sessionStorage.getItem('client_nom_premium');
        let nomFidele = nomPremium || (clientData ? `${clientData.prenom} ${clientData.nom}` : "");
        let idFidele = (codeSaisi || sessionStorage.getItem('tabia_auth_qr')) || clientId || "client_anonyme";
        
        let tableFinale = (numTable === 'Emporter') ? 'Emporter' : (parseInt(numTable) || 0);
        
        // 🔥 SÉCURITÉ 2 : Calcul sécurisé du total pour éviter l'erreur NaN qui fait crasher le serveur
        let totalCommande = panierPropre.reduce((sum, item) => sum + ((parseFloat(item.prix) || 0) * (parseInt(item.quantite) || 1)), 0);
        
        // 🔥 APPLICATION DE LA REMISE PROMO
        if (window.remisePromoActuelle > 0) {
            totalCommande = totalCommande - window.remisePromoActuelle;
            if (totalCommande < 0) totalCommande = 0;
        }
        
        const methodeElement = document.getElementById('methodePaiementClient');
        const methodeChoisie = methodeElement ? methodeElement.value : 'especes';
        
        const response = await fetch('/api/commandes', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // 🔥 SÉCURITÉ 3 : Forçage des types de données (MongoDB ne pourra plus refuser la commande)
                articles: panierPropre.map(a => ({ 
                    id: String(a.baseId || a.id || Date.now()), 
                    baseId: String(a.baseId || a.id),
                    nom: String(a.nom), 
                    variante: a.variante ? String(a.variante) : "", 
                    prix: Number(a.prix) || 0, 
                    quantite: Number(a.quantite) || 1,
                    isSupplement: Boolean(a.isSupplement || (a.nom && String(a.nom).startsWith('+'))),
                    uniqueGroupId: Number(a.uniqueGroupId) || Date.now(), 
                    parentId: a.parentId ? Number(a.parentId) : null
                })),
                numeroTable: String(tableFinale),
                clientId: String(idFidele), 
                codeAuth: String(idFidele), 
                clientName: String(nomFidele), 
                total: Number(totalCommande) || 0,
                methodePaiement: String(methodeChoisie),
                total: Number(totalCommande) || 0,
                methodePaiement: String(methodeChoisie),
                remise: window.remisePromoActuelle || 0,
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
            
            const messageSucces = (nomFidele && nomFidele !== "Client") ? `🎉 Merci ${nomFidele} ! Commande envoyée.` : "🎉 Commande envoyée avec succès !";
            afficherNotification(messageSucces, "success");
            
            if (commande.bonusInfo) {
                setTimeout(() => {
                    afficherNotification(commande.bonusInfo, "success");
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]); 
                }, 3000); 
            }
            
        } else { 
            // Sécurisation de l'affichage des erreurs
            const erreurData = await response.json().catch(() => ({ error: "Erreur serveur non reconnue" }));
            
            if (response.status === 403) {
                afficherNotification("❌ " + erreurData.error, "error");
                sessionStorage.removeItem('tabia_table_qr');
                sessionStorage.removeItem('tabia_auth_qr');
                sessionStorage.removeItem('client_nom_premium'); 
                setTimeout(() => { window.location.reload(); }, 2500);
            } else if (response.status === 400) {
                afficherNotification("⚠️ " + erreurData.error, "error"); 
            } else {
                afficherNotification("❌ Erreur serveur interne", "error"); 
            }
        }
    } catch (e) { 
        afficherNotification("❌ Erreur de connexion au serveur", "error"); 
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
    
    // 🔥 CORRECTION : Tous les événements sont maintenant sur l'unique bonne connexion
    socket.on('update_stock', () => {
        chargerCatalogue(); 
    });

    socket.on('nouvelle_commande', (data) => {
        chargerMesCommandes(); 
    });

    socket.on('mise_a_jour_commande', (commande) => {
        // Si on reçoit juste un signal générique
        if (!commande || !commande.id) {
            chargerMesCommandes();
            return;
        }

        // Si on reçoit une commande précise
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
        if (produitEnAttenteOption) {
            
            // --- 1. RÉCOLTE DES VARIANTES (Groupes) ---
            let choixFinaux = [];
            const groupesHtml = document.querySelectorAll('.variant-group');
            
            groupesHtml.forEach((groupe, idx) => {
                const coches = groupe.querySelectorAll(`input[name="variant_group_${idx}"]:checked`);
                if (coches.length > 0) {
                    // S'il y en a plusieurs (Checkbox), on les lie avec un "+"
                    const valeurs = Array.from(coches).map(c => c.value).join('+'); 
                    choixFinaux.push(valeurs);
                }
            });
            const varianteFinale = choixFinaux.join(' / '); // Ex: "Poulet / Harissa+Mayo"

            // --- 2. RÉCOLTE DES SUPPLÉMENTS PAYANTS ---
            let supplementsChoisis = [];
            const checkedSupps = document.querySelectorAll('input[name="supplementOption"]:checked');
            
            if (checkedSupps.length > 0) {
                supplementsChoisis = Array.from(checkedSupps).map(box => ({
                    id: box.getAttribute('data-id'),
                    nom: box.getAttribute('data-nom'),
                    prix: box.value
                }));
            }
            
            // --- 3. ENVOI AU PANIER GLOBAL ---
            executerAjoutPanier(produitEnAttenteOption, varianteFinale, supplementsChoisis);
            
            animerVersPanierClient(e); 
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
// =========================================================
// 🔥 MOTEUR MENU BUILDER (ASSISTANT DE FORMULE CLIENT)
// =========================================================
window.comboEnCours = null;

window.demarrerWizardCombo = function(comboId) {
    const combo = window.listeCombos.find(c => String(c.id) === String(comboId));
    if(!combo) return;
    
    window.comboEnCours = { 
        comboOrigine: combo,
        etapeActuelle: 0,
        selections: [], 
        idGroupeUnique: Date.now() 
    };
    afficherEtapeCombo();
};

window.afficherEtapeCombo = function() {
    const c = window.comboEnCours;
    
    // Si terminé, on finalise
    if (c.etapeActuelle >= c.comboOrigine.etapes.length) {
        finaliserComboPanier();
        return;
    }
    
    const etape = c.comboOrigine.etapes[c.etapeActuelle];
    const prodsDispos = produits.filter(p => p.categorie === etape.categorieCible && p.actif !== false && window.calculerStockReel(p) > 0);
    
    const existant = document.getElementById('modalWizardComboClient');
    if (existant) existant.remove();

    // Affichage des choix déjà faits
    let choixPrecedentsHtml = '';
    if (c.selections.length > 0) {
        choixPrecedentsHtml = `<div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:10px; margin-bottom:15px; font-size:0.85rem; color:#cbd5e1;">
            <strong style="color:var(--success);">Votre sélection :</strong><br>
            ${c.selections.map(s => `✔️ ${s.nom}`).join('<br>')}
        </div>`;
    }

    // Bouton retour
    const btnRetourHtml = c.etapeActuelle > 0 
        ? `<button onclick="retourEtapeCombo()" style="background:transparent; border:1px solid #cbd5e1; color:#cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-arrow-left"></i> Retour</button>` 
        : `<div></div>`;

    let html = `
        <div class="modal active" id="modalWizardComboClient" style="z-index: 3000; align-items: flex-end; padding-bottom: 0;">
            <div class="modal-content" style="background: linear-gradient(135deg, #1e293b, #0f172a); border-top: 3px solid #f59e0b; width:100%; border-radius: 25px 25px 0 0; padding: 20px; box-shadow: 0 -10px 40px rgba(245, 158, 11, 0.2); animation: slideUp 0.3s ease-out; max-height: 85vh; overflow-y: auto;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                    ${btnRetourHtml}
                    <button onclick="document.getElementById('modalWizardComboClient').remove()" style="background:rgba(255,255,255,0.1); border:none; color:white; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
                
                <div style="text-align:center; margin-bottom:15px;">
                    <h3 style="color:white; font-size:1.2rem; font-weight:800; margin:0;"><i class="fas fa-utensils text-warning"></i> ${escapeHtml(c.comboOrigine.nom)}</h3>
                </div>

                ${choixPrecedentsHtml}
                
                <div style="background:rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color:#fcd34d; padding:15px; border-radius:12px; margin-bottom:15px; font-weight:800; text-align:center;">
                    <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px;">Étape ${c.etapeActuelle + 1} / ${c.comboOrigine.etapes.length}</div>
                    <div style="font-size:1.3rem;">${escapeHtml(etape.titre)}</div>
                </div>
                
                <div style="display:flex; flex-direction:column; gap:10px; padding-bottom:20px;">
    `;
    
    if (prodsDispos.length === 0) {
        html += `<div style="text-align:center; padding:20px; color:#f87171; font-weight:bold; background:rgba(244,63,94,0.1); border-radius:12px;">Épuisé pour aujourd'hui !</div>`;
    } else {
        prodsDispos.forEach(p => {
            const img = p.image || 'https://via.placeholder.com/80';
            html += `
                <button onclick="choisirItemCombo('${p.id||p._id}', '${escapeHtml(p.nom)}'); document.getElementById('modalWizardComboClient').remove();" 
                        style="display:flex; align-items:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:15px; padding:10px; cursor:pointer; text-align:left; transition:0.2s;">
                    <img src="${img}" style="width: 50px; height: 50px; border-radius: 10px; object-fit: cover; margin-right:15px; border: 1px solid #475569;">
                    <div style="flex:1;">
                        <div style="color:white; font-size:1rem; font-weight:700;">${escapeHtml(p.nom)}</div>
                    </div>
                    <i class="fas fa-plus-circle" style="color:#f59e0b; font-size: 1.2rem;"></i>
                </button>
            `;
        });
    }
    
    html += `</div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

// 🔥 NOUVELLE FONCTION : Permet de revenir en arrière dans la formule
window.retourEtapeCombo = function() {
    if (window.comboEnCours && window.comboEnCours.etapeActuelle > 0) {
        window.comboEnCours.etapeActuelle--;
        window.comboEnCours.selections.pop(); // Retire le dernier choix
        afficherEtapeCombo();
    }
};

window.choisirItemCombo = function(produitId, produitNom) {
    window.comboEnCours.selections.push({ id: produitId, nom: produitNom });
    window.comboEnCours.etapeActuelle++;
    afficherEtapeCombo();
};

window.finaliserComboPanier = function() {
    const c = window.comboEnCours;
    
    // 1. L'En-tête du Menu (C'est lui qui porte le prix fixe et n'a pas de stock !)
    const itemMenu = {
        cartId: `COMBO_${c.idGroupeUnique}`,
        id: c.comboOrigine.id, baseId: c.comboOrigine.id,
        nom: `🌟 ${c.comboOrigine.nom}`, variante: null,
        prix: Number(c.comboOrigine.prixFixe), quantite: 1,
        isSupplement: false, uniqueGroupId: c.idGroupeUnique, parentId: null,
        envoye: false, pret: false
    };
    
    // Ajout selon l'environnement (Client = panier.push / Caisse = ajouterAuTicket)
    if (typeof panier !== 'undefined') panier.push(itemMenu);
    else ajouterAuTicket(currentTable, itemMenu, false, false);

    // 2. Les produits choisis (Prix à 0)
    c.selections.forEach((sel, idx) => {
        const itemEnfant = {
            cartId: `COMBO_CHILD_${c.idGroupeUnique}_${idx}`,
            id: sel.id, baseId: sel.id,
            nom: `↳ ${sel.nom}`, variante: null,
            prix: 0, quantite: 1, 
            isSupplement: false, // 🔥 CORRECTION VITALE : C'est un vrai produit pour le backend !
            uniqueGroupId: Date.now() + Math.random(),
            parentId: c.idGroupeUnique,
            envoye: false, pret: false
        };
        if (typeof panier !== 'undefined') panier.push(itemEnfant);
        else ajouterAuTicket(currentTable, itemEnfant, false, false);
    });

    window.comboEnCours = null;
    
    // Refresh selon l'environnement
    if (typeof sauvegarderPanier === 'function') {
        sauvegarderPanier(); mettreAJourUIPanier(); afficherContenuPanier(); animerBoutonPanier();
        if(navigator.vibrate) navigator.vibrate([50, 100, 50]);
        afficherNotification("Menu ajouté au panier !", "success");
    } else {
        afficherTicket(); afficherListeTables(); sauvegarderTousLesTickets();
    }
};
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
