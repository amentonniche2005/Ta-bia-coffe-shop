// ========== SÉCURITÉ : VÉRIFICATION DU TOKEN ==========
const monToken = localStorage.getItem('tabia_caisse_token');

if (!monToken) {
    window.location.href = '/caisse-login.html'; 
}

async function fetchSecurise(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['authorization'] = monToken; 
    options.headers['Content-Type'] = 'application/json';
    
    const reponse = await fetch(url, options);
    if (reponse.status === 403) {
        alert("Votre Token a expiré ou a été révoqué.");
        localStorage.removeItem('tabia_caisse_token');
        window.location.href = '/caisse-login.html';
    }
    return reponse;
}

// ========== COMPTOIR AVEC SOCKET.IO - LOGIQUE KDS ==========
let filtreActuel = "all";
let commandesComptoirCache = [];
let vueActuelle = "commandes"; // Peut être "commandes" ou "synthese"

async function chargerCommandes() {
    try {
        const response = await fetchSecurise('/api/commandes');
        const commandes = await response.json();
        commandesComptoirCache = commandes.filter(c => c.statut !== 'paye');
        afficherCommandes();
    } catch (error) {
        afficherNotification("❌ Erreur de chargement des commandes", "error");
    }
}

// ========== ACTIONS ==========
async function demarrerPreparation(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'en_preparation' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
}

async function terminerCommande(id) {
    try {
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'terminee' })
        });
        if (response.ok) jouerSonAction();
    } catch (error) { afficherNotification("❌ Erreur réseau", "error"); }
}

// ========== SOCKET.IO ==========
let socket = null;

function initSocket() {
    
    socket = io({ 
    auth: { token: monToken }, 
    transports: ['websocket', 'polling'], 
    reconnection: true 
});
    socket.on('connect', () => {
        document.getElementById('onlineStatus').textContent = '🟢';
        afficherNotification('Connexion au serveur rétablie', 'success');
    });
    
    socket.on('disconnect', () => {
        document.getElementById('onlineStatus').textContent = '🔴';
        afficherNotification('⚠️ Déconnecté du serveur', 'warning');
    });
    
    socket.on('nouvelle_commande', (commande) => {
        commandesComptoirCache.push(commande);
        afficherCommandes();
        jouerSonNouvelleCommande();
        
        const nomAlerte = commande.clientName ? commande.clientName : `Commande #${commande.numero}`;
        afficherNotification(`📢 Nouvelle : ${nomAlerte}`, "info");
        
        setTimeout(() => {
            const el = document.querySelector(`.ticket[data-id="${commande.id}"]`);
            if(el) el.style.animation = 'flash 1s ease';
        }, 50);
    });
    
    socket.on('mise_a_jour_commande', (commande) => {
        const index = commandesComptoirCache.findIndex(c => c.id === commande.id);
        if (commande.statut === 'paye') {
            if (index !== -1) commandesComptoirCache.splice(index, 1);
        } else {
            if (index !== -1) commandesComptoirCache[index] = commande;
            else commandesComptoirCache.push(commande);
        }
        afficherCommandes();
    });
    
    socket.on('suppression_commande', (id) => {
        commandesComptoirCache = commandesComptoirCache.filter(c => c.id !== id);
        afficherCommandes();
    });
}

// ========== AFFICHAGE (Rendu HTML) ==========
function afficherCommandes() {
    const enAttente = commandesComptoirCache.filter(c => c.statut === 'en_attente');
    const enPreparation = commandesComptoirCache.filter(c => c.statut === 'en_preparation');
    const terminees = commandesComptoirCache.filter(c => c.statut === 'terminee');
    
    enAttente.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    enPreparation.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    terminees.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    afficherColonne("commandesAttente", enAttente, "attente");
    afficherColonne("commandesPreparation", enPreparation, "preparation");
    afficherColonne("commandesTerminees", terminees, "terminee");
    
    document.getElementById("nbAttente").textContent = enAttente.length;
    document.getElementById("nbPreparation").textContent = enPreparation.length;
    // Met à jour la synthèse en temps réel si elle est ouverte
    if (vueActuelle === "synthese") {
        afficherSynthese();
    }
}
async function appliquerBranding() {
    try {
        // 1. On récupère les réglages depuis ton API /api/branding
        const response = await fetch('/api/branding');
        const config = await response.json();

        if (config) {
            // 2. Mise à jour du Nom du café
            document.getElementById('dynamicName').innerText = config.nomCafe || "SARBINI";

            // 3. Mise à jour du Slogan (Coffee Shop, Bar, etc.)
            document.getElementById('dynamicSlogan').innerText = config.sloganCafe || "";

            // 4. Mise à jour du Logo
            if (config.logoUrl) {
                document.getElementById('dynamicLogo').src = config.logoUrl;
            }


        }
    } catch (error) {
        console.error("Erreur lors du chargement du branding:", error);
    }
}

// Lancer la fonction au chargement de la page
window.onload = appliquerBranding;
function afficherColonne(containerId, commandes, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let commandesFiltrees = commandes;
    
    // Filtres actuels
    if (filtreActuel !== "all") {
        commandesFiltrees = commandes.filter(cmd => {
            if (filtreActuel === "fidele") return cmd.clientName != null;
            if (filtreActuel === "client") return cmd.clientId != null && cmd.clientName == null;
            if (filtreActuel === "comptoir") return cmd.clientId == null && cmd.clientName == null;
            return true;
        });
    }
    
    if (commandesFiltrees.length === 0) {
        container.innerHTML = `<div class='empty-col'><i class="fas fa-clipboard-check"></i><p>Aucune commande</p></div>`;
        return;
    }
    
    container.innerHTML = commandesFiltrees.map(cmd => {
        const timeStr = cmd.date ? cmd.date.split(' ')[1] : new Date(cmd.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const nomAffiche = cmd.clientName ? `<i class="fas fa-star"></i> ${cmd.clientName}` : `#${cmd.numero}`;
        const colorTitre = cmd.clientName ? 'color:#ea580c; font-size:1.2rem;' : ''; 
        const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;
        
        const badgeTable = cmd.clientName 
            ? `<span class="badge" style="background:#fef5e6; color:#e67e22; border:1px solid #fed7aa;"><i class="fas fa-star"></i> Fidèle - ${textTable}</span>` 
            : `<span class="badge badge-table"><i class="fas fa-chair"></i> ${textTable}</span>`;
        
        const badgeOrigine = cmd.clientId && !cmd.clientName 
            ? `<span class="badge badge-client"><i class="fas fa-mobile-alt"></i> Web</span>` : ``;

// 🔥 CORRECTION : On vérifie si c'est payé en ligne OU par Carte Fidélité
        const estPaye = (cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité');
        
        const badgePaiement = estPaye
            ? `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;"><i class="fas fa-check-circle"></i> Payé</span>`
            : `<span class="badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca;"><i class="fas fa-hand-holding-usd"></i> À encaisser</span>`;

// 🔥 NOUVEAUTÉ : GÉNÉRATION DU BADGE CHRONOMÈTRE (SLA) AVEC DATA-TIMESTAMP
        let slaHtml = '';
        if (cmd.statut !== 'terminee') {
            const sla = getSLAInfo(cmd.timestamp);
            // On ajoute l'ID de la commande et le timestamp pour le chronomètre en direct
            slaHtml = `<div id="sla-${cmd.id}" class="sla-badge ${sla.class}" data-timestamp="${cmd.timestamp}">
                         <i class="fas ${sla.icon}"></i> <span>${sla.text}</span>
                       </div>`;
        }

const platsPrincipaux = cmd.articles.filter(a => !a.isSupplement && !(a.nom && a.nom.startsWith('+')));
        
        const itemsHtml = platsPrincipaux.map(a => {
            // 1. Le plat principal
            let html = `
            <li class="item-row" style="margin-bottom: 2px;">
                <div class="item-qty">${a.quantite || 1}</div>
                <div class="item-name" style="font-weight:bold;">${a.nom} ${a.variante ? `<span style="display:block; font-size:0.8rem; color:#e67e22; font-weight:bold;">↳ ${a.variante}</span>` : ''}</div>
            </li>`;
            
            // 2. Les suppléments de CE plat
            const mesSupps = cmd.articles.filter(supp => (supp.isSupplement || (supp.nom && supp.nom.startsWith('+'))) && supp.parentId === a.uniqueGroupId);
            mesSupps.forEach(supp => {
                html += `
                <li class="item-row" style="margin-bottom: 2px; padding-left: 20px; opacity: 0.9;">
                    <div class="item-qty" style="visibility:hidden;">-</div>
                    <div class="item-name" style="font-size:0.85rem; color:#d35400; font-weight:bold;"><i class="fas fa-plus-circle" style="font-size:0.7rem;"></i> Supp: ${supp.nom.replace('+ ', '')}</div>
                </li>`;
            });
            return html;
        }).join('');

        return `
            <div class="ticket" data-id="${cmd.id}" onclick="voirDetails(${cmd.id})">
                <div class="ticket-header">
                    <span class="ticket-id" style="${colorTitre}">${nomAffiche}</span>
                    <div class="ticket-time-container">
                        <span class="ticket-time"><i class="far fa-clock"></i> ${timeStr}</span>
                        ${slaHtml} </div>
                </div>
                <div class="badges-row">
                    ${badgeTable} ${badgeOrigine} ${badgePaiement} 
                </div>
                <ul class="items-list">
                    ${itemsHtml}
                </ul>
<div class="ticket-actions">
                    <button class="btn-action" style="background:#64748b; flex: 0.3;" onclick="event.stopPropagation(); imprimerTicket(${cmd.id})">
                        <i class="fas fa-print"></i>
                    </button>
                    ${getBoutonsAction(cmd, type)}
                </div>
            </div>
        `;
    }).join('');
}

function getBoutonsAction(cmd, type) {
    if (type === "attente") {
        return `<button class="btn-action btn-start" onclick="event.stopPropagation(); demarrerPreparation(${cmd.id})"><i class="fas fa-fire"></i> Préparer</button>`;
    } else if (type === "preparation") {
        return `<button class="btn-action btn-finish" onclick="event.stopPropagation(); terminerCommande(${cmd.id})"><i class="fas fa-check-double"></i> Terminer</button>`;
    } else if (type === "terminee") {
        // 🔥 NOUVEAU : LE BOUTON OUPS POUR LES COMMANDES TERMINÉES
        return `<button class="btn-action" style="background:#ef4444;" onclick="event.stopPropagation(); annulerTerminee(${cmd.id})"><i class="fas fa-undo"></i> Oups !</button>`;
    }
    return "";
}

// ========== MODAL DÉTAILS ==========
function voirDetails(id) {
    const cmd = commandesComptoirCache.find(c => c.id === id);
    if (!cmd) return;
    
    document.getElementById("modalTitle").textContent = cmd.clientName ? `Détails de ${cmd.clientName}` : `Commande #${cmd.numero}`;
    
    const textTable = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? 'À Emporter' : `Table ${cmd.numeroTable}`;

    // 🔥 Génération du HTML des articles avec la logique Parent-Enfant
    const platsCuisine = cmd.articles.filter(a => !a.isSupplement && !(a.nom && a.nom.startsWith('+')));
    const articlesHtml = platsCuisine.map(a => {
        let htmlDetail = `
            <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom:0.2rem; font-weight:700; font-size: 1.1rem; color:#1e293b;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span style="background: #e2e8f0; padding: 4px 10px; border-radius: 6px;">${a.quantite}x</span>
                    <span>${a.nom} ${a.variante ? `<i style="color:#64748b; font-size:0.9rem;">(${a.variante})</i>` : ''}</span>
                </div>
            </div>`;
        
        const mesSupps = cmd.articles.filter(supp => (supp.isSupplement || (supp.nom && supp.nom.startsWith('+'))) && supp.parentId === a.uniqueGroupId);
        mesSupps.forEach(supp => {
            htmlDetail += `
            <div style="display:flex; align-items: center; margin-bottom:0.6rem; margin-left:45px; font-weight:800; font-size: 0.95rem; color:#d35400;">
                <i class="fas fa-plus-circle" style="margin-right:5px; font-size:0.8rem;"></i> Supp: ${supp.nom.replace('+ ', '')}
            </div>`;
        });
        return htmlDetail;
    }).join('');

    let html = `
        <div style="margin-bottom: 1.5rem; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #e2e8f0;">
            <div style="margin-bottom:0.5rem; font-size: 1.1rem;">
                <strong><i class="fas fa-map-marker-alt"></i> Destination :</strong> 
                ${cmd.clientName ? `<span style="color:#e67e22; font-weight:bold;">🌟 Fidèle (${cmd.clientName}) - ${textTable}</span>` : textTable}
            </div>
            <div style="margin-bottom:0.5rem;"><strong><i class="fas fa-compass"></i> Origine :</strong> ${cmd.clientId ? 'Client Web (Mobile)' : 'Caisse / Serveur'}</div>
            
            <div style="margin-bottom:0.5rem;">
                <strong><i class="fas fa-wallet"></i> Paiement :</strong> 
                ${(cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité')
                    ? '<span style="color:#166534; font-weight:bold; background:#dcfce7; padding:2px 8px; border-radius:10px;">✅ Déjà payé (En Ligne / Wallet)</span>' 
                    : '<span style="color:#b91c1c; font-weight:bold; background:#fee2e2; padding:2px 8px; border-radius:10px;">⚠️ À encaisser à la caisse</span>'}
            </div>

            <div><strong><i class="far fa-clock"></i> Heure :</strong> ${cmd.date || new Date(cmd.timestamp).toLocaleString()}</div>
        </div>
        
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;">Articles à préparer</h3>
        <div style="border-radius: 10px;">
            ${articlesHtml}
        </div>
    `;
    
    document.getElementById("modalBody").innerHTML = html;
    document.getElementById("modalDetails").style.display = "flex";
}

function fermerModal(event) {
    if(event && event.target.id !== 'modalDetails') return;
    document.getElementById("modalDetails").style.display = "none";
}

// ========== UTILITAIRES ==========
function changerFiltre(filtre) {
    filtreActuel = filtre;
    document.querySelectorAll(".filtre-btn").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");
    afficherCommandes();
}

function rafraichirCommandes() {
    chargerCommandes();
    afficherNotification("🔄 Synchronisation effectuée", "info");
}

function afficherNotification(msg, type = "info") {
    const notif = document.createElement("div");
    notif.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; color: white;
        padding: 1rem 1.5rem; border-radius: 12px; z-index: 9999; 
        font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        background: ${type === 'error' ? '#e74c3c' : (type === 'success' ? '#10b981' : '#3b82f6')};
    `;
    notif.innerHTML = msg;
    document.body.appendChild(notif);
    setTimeout(() => { 
        notif.style.transform = 'translateX(120%)'; 
        setTimeout(() => notif.remove(), 300); 
    }, 3000);
}

// ========== SONS ==========
function jouerSonNouvelleCommande() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function jouerSonAction() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}
// ========== CALCUL DU TEMPS D'ATTENTE (SLA) ==========
// ========== CALCUL DU TEMPS D'ATTENTE (SLA) ==========
function getSLAInfo(timestamp) {
    const now = Date.now();
    const diffMs = now - (timestamp || now);
    const diffMins = Math.floor(diffMs / 60000); // Convertir en minutes

    let slaClass = 'sla-good';
    let icon = 'fa-check-circle';

    if (diffMins >= 10) {
        slaClass = 'sla-danger';
        icon = 'fa-fire';
    } else if (diffMins >= 5) {
        slaClass = 'sla-warning';
        icon = 'fa-exclamation-triangle';
    }

    return { class: slaClass, text: `${diffMins} min`, icon: icon, minutes: diffMins };
}
// ========== CHRONOMÈTRE FLUIDE EN TEMPS RÉEL ==========
function demarrerChronoFluid() {
    setInterval(() => {
        // On sélectionne tous les badges SLA actuellement affichés à l'écran
        const slaBadges = document.querySelectorAll('.sla-badge');
        
        slaBadges.forEach(badge => {
            const timestamp = parseInt(badge.getAttribute('data-timestamp'));
            if (!timestamp) return;

            const sla = getSLAInfo(timestamp);
            
            // 1. On met à jour le texte du temps (Ex: "4 min")
            const textSpan = badge.querySelector('span');
            if (textSpan && textSpan.innerText !== sla.text) {
                textSpan.innerText = sla.text;
            }

            // 2. On met à jour l'icône si elle a changé
            const icon = badge.querySelector('i');
            if (icon && !icon.classList.contains(sla.icon)) {
                icon.className = `fas ${sla.icon}`;
            }

            // 3. On met à jour la couleur (Classe CSS) si le palier (5 ou 10 min) est franchi
            if (!badge.classList.contains(sla.class)) {
                badge.classList.remove('sla-good', 'sla-warning', 'sla-danger');
                badge.classList.add(sla.class);
            }
        });
    }, 1000); // Tourne toutes les secondes (1000 ms)
}
// ========== LOGIQUE VUE SYNTHÈSE (PRODUCTION GROUPÉE) ==========

window.basculerVue = function(vue) {
    vueActuelle = vue;
    
    // Changement visuel des boutons
    document.getElementById('btnVueCommandes').classList.toggle('active', vue === 'commandes');
    document.getElementById('btnVueSynthese').classList.toggle('active', vue === 'synthese');
    
    // Affichage des bons conteneurs
    if (vue === 'commandes') {
        document.getElementById('commandesContainer').style.display = 'flex';
        document.getElementById('syntheseContainer').style.display = 'none';
        afficherCommandes();
    } else {
        document.getElementById('commandesContainer').style.display = 'none';
        document.getElementById('syntheseContainer').style.display = 'block';
        afficherSynthese();
    }
};

function afficherSynthese() {
    const container = document.getElementById('syntheseContainer');
    if (!container) return;

    const produitsAGrouper = {};

    // 1. On parcourt les commandes "En Attente" et "En Préparation" uniquement
    commandesComptoirCache.forEach(cmd => {
        if (cmd.statut === 'en_attente' || cmd.statut === 'en_preparation') {
            
            // On respecte les filtres (si le gérant filtre "Sur Place", on n'additionne que ça)
            let conserver = true;
            if (filtreActuel === "fidele" && !cmd.clientName) conserver = false;
            if (filtreActuel === "client" && (!cmd.clientId || cmd.clientName)) conserver = false;
            if (filtreActuel === "comptoir" && (cmd.clientId || cmd.clientName)) conserver = false;

            if (conserver) {
                // 2. On additionne les articles
                cmd.articles.forEach(art => {
                    // Clé unique pour différencier "Direct (Serré)" de "Direct (Allongé)"
                    const cle = `${art.nom}_${art.variante || 'standard'}`;
                    
                    if (!produitsAGrouper[cle]) {
                        produitsAGrouper[cle] = { nom: art.nom, variante: art.variante, quantite: 0 };
                    }
                    produitsAGrouper[cle].quantite += (art.quantite || 1);
                });
            }
        }
    });

    // 3. Transformation en tableau et tri (Les plus demandés en premier)
    const tableauSynthese = Object.values(produitsAGrouper).sort((a, b) => b.quantite - a.quantite);

    if (tableauSynthese.length === 0) {
        container.innerHTML = `<div class='empty-col' style='margin-top:5rem;'><i class="fas fa-mug-hot" style="font-size:5rem;"></i><p>Aucun produit en cours de production</p></div>`;
        return;
    }

    // 4. Création du HTML des grosses cartes
    container.innerHTML = `
        <h2 style="margin-bottom: 2rem; color: #1e293b; font-size: 2rem; font-weight: 800;"><i class="fas fa-layer-group"></i> Production Groupée en cours</h2>
        <div class="synthese-grid">
            ${tableauSynthese.map(item => `
                <div class="synthese-card">
                    <div class="synthese-qty">${item.quantite}</div>
                    <div>
                        <div class="synthese-name">${item.nom}</div>
                        ${item.variante ? `<span class="synthese-variant">${item.variante}</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ========== ANIMATION CSS DYNAMIQUE ==========
const style = document.createElement('style');
style.textContent = `
    @keyframes flash { 0% { background: #fef08a; transform: scale(1.02); } 100% { background: white; transform: scale(1); } }
    @keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);
// 🔥 INSCRIPTION DU SERVICE WORKER (Pour l'installation de l'application)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker activé sur cette application !'))
                .catch(err => console.log('Erreur Service Worker', err));
        });
    }

// ========== INIT ==========

document.addEventListener("DOMContentLoaded", () => {
    initSocket();
    chargerCommandes();
    
    // 🔥 Lancement du chronomètre invisible
    demarrerChronoFluid();
});

window.demarrerPreparation = demarrerPreparation;
window.terminerCommande = terminerCommande;
window.voirDetails = voirDetails;
window.fermerModal = fermerModal;
window.rafraichirCommandes = rafraichirCommandes;
window.changerFiltre = changerFiltre;

// ========== FONCTION IMPRESSION TICKET (DESIGN CAISSE STANDARD) ==========
window.imprimerTicket = function(id) {
    // 1. Récupération de la commande
    const cmd = commandesComptoirCache.find(c => String(c.id) === String(id));
    if (!cmd) {
        afficherNotification("Commande introuvable pour l'impression", "error");
        return;
    }

    const zonePrint = document.getElementById('ticket-impression');
    if (!zonePrint) return;

    // 2. Formatage des données (Identique à la caisse)
    const dateObj = new Date(cmd.timestamp || Date.now());
    const dateStr = dateObj.toLocaleDateString('fr-FR');
    const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    let nomOrigine = (cmd.numeroTable === 'Emporter' || !cmd.numeroTable) ? "📦 Emporter" : `Table ${cmd.numeroTable}`;
    if (cmd.clientName) nomOrigine = `Fidèle : ${cmd.clientName}`;

    // 3. Génération de la liste des articles (Logique Parent-Enfant)
    let articlesHTML = '';
    const platsPrint = cmd.articles.filter(a => !a.isSupplement && !(a.nom && a.nom.startsWith('+')));
    
    platsPrint.forEach(a => {
        articlesHTML += `
        <div style="display: flex; justify-content: space-between; font-family: 'Courier New', Courier, monospace; font-size: 14px; font-weight: bold; margin-bottom: 2px;">
            <div style="flex: 1;">${a.quantite}x ${a.nom.toUpperCase()}</div>
            <div style="width: 70px; text-align: right;">${(parseFloat(a.prix) * a.quantite).toFixed(2)}</div>
        </div>
        ${a.variante ? `<div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; margin-left: 15px; margin-bottom: 4px;">> ${a.variante}</div>` : ''}`;
        
        const mesSupps = cmd.articles.filter(supp => (supp.isSupplement || (supp.nom && supp.nom.startsWith('+'))) && supp.parentId === a.uniqueGroupId);
        mesSupps.forEach(supp => {
            articlesHTML += `
            <div style="display: flex; justify-content: space-between; font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: bold; margin-bottom: 4px; padding-left: 20px; color: #555;">
                <div style="flex: 1;">+ ${supp.nom.replace('+ ', '').toUpperCase()}</div>
            </div>`;
        });
    });

    // 4. Injection du HTML (Design Caisse)
    zonePrint.style.display = 'block';
    zonePrint.innerHTML = `
        <div style="width: 100%; max-width: 80mm; margin: 0 auto; color: #000; font-family: 'Courier New', Courier, monospace; background: #fff; padding: 0;">
            
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="margin: 0; font-size: 22px; font-weight: bold;">TA'BIA COFFEE</h2>
                <p style="margin: 5px 0 0 0; font-size: 12px;">Ticket Cuisine / Préparation</p>
            </div>
            
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="font-size: 13px; line-height: 1.5;">
                <div style="display: flex; justify-content: space-between;">
                    <span><b>TICKET:</b> #${cmd.numero || cmd.id}</span>
                    <span>${dateStr} ${timeStr}</span>
                </div>
                <div><b>ORIGINE:</b> ${nomOrigine}</div>
                <div><b>STATUT:</b> ${(cmd.methodePaiement === 'en_ligne' || cmd.methodePaiement === 'carte_fidelite' || cmd.methodePaiement === 'Carte Fidélité') ? 'DÉJÀ PAYÉ' : 'À ENCAISSER'}</div>            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 5px;">
                <div style="flex: 1;">QTE x DESIGNATION</div>
                <div style="width: 70px; text-align: right;">MONTANT</div>
            </div>
            
            <div style="border-top: 1px solid #000; margin-bottom: 8px;"></div>

            <div style="margin-bottom: 10px;">
                ${articlesHTML}
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: bold; margin: 10px 0;">
                <span>TOTAL A PAYER</span>
                <span>${parseFloat(cmd.total || 0).toFixed(2)} DT</span>
            </div>

            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>

            <div style="text-align: center; font-size: 12px; margin-top: 15px;">
                <p style="margin: 0;">*** BONNE DÉGUSTATION ***</p>
            </div>
            
            <div style="height: 40px;"></div> 
        </div>
    `;

    // 5. Lancement de l'impression
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            zonePrint.style.display = 'none';
            zonePrint.innerHTML = '';
        }, 500);
    }, 150); 
};
// ========== FONCTION "OUPS" (RETOUR EN PRÉPARATION) ==========
window.annulerTerminee = async function(id) {
    try {
        // On remet le statut à 'en_preparation'
        const response = await fetchSecurise(`/api/commandes/${id}/statut`, {
            method: 'PUT', body: JSON.stringify({ statut: 'en_preparation' })
        });
        if (response.ok) {
            jouerSonAction();
            afficherNotification("🔙 Commande remise en préparation !", "info");
        }
    } catch (error) { 
        afficherNotification("❌ Erreur réseau", "error"); 
    }
};

// ========== LOGIQUE DU MODE SOMBRE ==========
window.toggleDarkMode = function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    // On sauvegarde le choix dans la mémoire de la tablette
    localStorage.setItem('tabia_dark_mode', isDark);
    
    // On change l'icône
    const icon = document.getElementById('iconDarkMode');
    if(icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
};

// Vérification au chargement de la page (si le barista avait déjà mis le mode sombre hier)
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('tabia_dark_mode') === 'true') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('iconDarkMode');
        if(icon) icon.className = 'fas fa-sun';
    }
});